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
}

export const checkHealth = async (baseUrl: string, token: string): Promise<boolean> => {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/healthz`, {
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
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: [message],
      model,
      stream: true,
      is_new_session: Boolean(isNewSession),
    }),
  });

  if (!response.ok) {
    throw new Error(`AI request failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!response.body || !contentType.includes('ndjson')) {
    const data = await response.json();
    return data?.content || '';
  }

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
