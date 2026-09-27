import type { Action } from '../contexts/AppContext';
import type { LocalStorageData } from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
  return body as T;
}

export const fetchData = () => request<LocalStorageData>('/api/data');
export const sendAction = (action: Action) => request<{ ok: true }>('/api/actions', { method: 'POST', body: JSON.stringify(action) });
