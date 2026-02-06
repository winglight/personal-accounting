export interface AIMessagePayload {
  role: 'user';
  content: string;
  image_data?: string;
  image_url?: string;
}

export interface AIStreamOptions {
  baseUrl: string;
  token: string;
  message: AIMessagePayload;
  model?: string;
  isNewSession?: boolean;
  onDelta?: (delta: string) => void;
  stream?: boolean;
}

const normalizeBaseUrl = (baseUrl: string) => {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && trimmed.startsWith('http://')) {
    return `https://${trimmed.slice('http://'.length)}`;
  }
  return trimmed;
};

export const checkHealth = async (baseUrl: string, token: string): Promise<boolean> => {
  try {
    const endpoint = `${normalizeBaseUrl(baseUrl)}/healthz`;
    const response = await fetch(endpoint, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.status === 'ok';
  } catch {
    return false;
  }
};

export const streamChat = async (options: AIStreamOptions): Promise<string> => {
  const { baseUrl, token, message, model, isNewSession, onDelta } = options;
  const useStream = options.stream !== undefined ? options.stream : true;

  const buildBody = (streamFlag: boolean) => JSON.stringify({
    messages: [message],
    model,
    stream: streamFlag,
    is_new_session: Boolean(isNewSession),
  });

  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: buildBody(useStream),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('ndjson') || !useStream) {
    const data = await response.json();
    return data?.content || '';
  }

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed);
          if (data.error) {
            throw new Error(data.error);
          }
          if (data.content) {
            full += data.content;
            if (onDelta) onDelta(data.content);
          }
        } catch (e) {
          console.warn('Failed to parse stream chunk:', e);
        }
      }
    }
    return full;
  } catch (err) {
    console.warn('Stream read failed, falling back to non-stream request:', err);
    const fallback = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: buildBody(false),
    });
    if (!fallback.ok) {
      throw new Error(`AI request failed: ${fallback.status} ${fallback.statusText}`);
    }
    const data = await fallback.json();
    const content = data?.content || '';
    if (content && onDelta) onDelta(content);
    return content;
  }

};

export const safeParseJson = <T = unknown>(content: string): T | null => {
  if (!content) return null;
  const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
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
