export interface AIMessagePayload {
  role: 'user';
  content: string;
  image_data?: string;
}

export interface AIStreamOptions {
  apiUrl: string;
  token: string;
  message: AIMessagePayload;
  model: string;
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

type ZhipuContent = string | Array<
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
>;

const normalizeApiUrl = (apiUrl: string) => apiUrl.trim().replace(/\/+$/, '');

const buildModelsUrl = (apiUrl: string) => {
  const normalized = normalizeApiUrl(apiUrl);
  if (/\/chat\/completions$/i.test(normalized)) {
    return normalized.replace(/\/chat\/completions$/i, '/models');
  }
  return `${normalized}/models`;
};

const buildContent = (message: AIMessagePayload): ZhipuContent => {
  if (!message.image_data) return message.content;
  return [
    { type: 'image_url', image_url: { url: message.image_data } },
    { type: 'text', text: message.content },
  ];
};

const extractError = async (response: Response) => {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || response.statusText;
  } catch {
    return response.statusText;
  }
};

export interface AIConnectionCheckResult {
  ok: boolean;
  message: string;
  missingModels?: string[];
}

export const checkHealth = async (
  apiUrl: string,
  token: string,
  models: string[],
): Promise<AIConnectionCheckResult> => {
  if (!apiUrl.trim()) return { ok: false, message: '请填写智谱 API 地址' };
  if (!token.trim()) return { ok: false, message: '请填写智谱 API Key' };
  const configuredModels = models.map(model => model.trim()).filter(Boolean);
  if (!configuredModels.length) return { ok: false, message: '请至少填写一个模型名称' };

  try {
    const response = await fetch(buildModelsUrl(apiUrl), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
      },
    });

    if (!response.ok) {
      const reason = await extractError(response);
      return { ok: false, message: `HTTP ${response.status}：${reason || '鉴权失败'}` };
    }

    const data = await response.json();
    const availableModels = Array.isArray(data?.data)
      ? data.data.map((item: { id?: unknown }) => typeof item?.id === 'string' ? item.id : '').filter(Boolean)
      : [];
    const missingModels = availableModels.length
      ? configuredModels.filter(model => !availableModels.includes(model))
      : [];

    if (missingModels.length) {
      return {
        ok: true,
        message: `API Key 有效。模型列表未列出：${missingModels.join('、')}；这不影响连接检测，请在实际调用失败时核对模型权限。可用模型：${availableModels.slice(0, 15).join('、')}`,
        missingModels,
      };
    }
    return { ok: true, message: 'API Key 有效，配置的模型可用' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `网络请求失败：${reason}` };
  }
};

export const streamChat = async (options: AIStreamOptions): Promise<string> => {
  const { apiUrl, token, message, model, onDelta, signal } = options;
  const response = await fetch(normalizeApiUrl(apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: message.role, content: buildContent(message) }],
      stream: true,
      temperature: 0.1,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${await extractError(response)}`);
  }

  if (!response.body) throw new Error('AI request failed: empty response body');
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    throw new Error(`AI request failed: expected event stream, received ${contentType || 'unknown content type'}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const data = JSON.parse(payload);
    if (data.error) throw new Error(data.error.message || String(data.error));
    const delta = data?.choices?.[0]?.delta?.content || '';
    if (delta) {
      full += delta;
      onDelta?.(delta);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) consumeLine(line);
  }
  if (buffer.trim()) consumeLine(buffer);
  return full;
};

export const safeParseJson = <T = unknown>(content: string): T | null => {
  if (!content) return null;
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
};
