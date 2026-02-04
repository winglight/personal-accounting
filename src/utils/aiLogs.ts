import { R2Config, R2SyncManager } from './r2Sync';

export type AILogEntry = {
  id: string;
  timestamp: string;
  direction: 'user' | 'ai';
  contentType: 'text' | 'image' | 'json';
  content: unknown;
  status?: 'success' | 'error' | 'queued';
  meta?: Record<string, unknown>;
};

export const getLogKey = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `ai_logs_${yyyy}-${mm}-${dd}`;
};

const loadLog = (key: string): AILogEntry[] => {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AILogEntry[];
  } catch {
    return [];
  }
};

const saveLog = (key: string, entries: AILogEntry[]) => {
  localStorage.setItem(key, JSON.stringify(entries));
};

export const appendLog = async (entry: AILogEntry, r2Config?: R2Config) => {
  const key = getLogKey(new Date(entry.timestamp));
  const entries = loadLog(key);
  entries.push(entry);
  saveLog(key, entries);
  if (r2Config?.enabled) {
    await R2SyncManager.upload(JSON.stringify(entries), r2Config, key);
  }
  return key;
};

export const readLog = (date: string) => {
  const key = `ai_logs_${date}`;
  return loadLog(key);
};

export const downloadLog = async (date: string, r2Config?: R2Config) => {
  if (!r2Config?.enabled) return [];
  const key = `ai_logs_${date}`;
  const content = await R2SyncManager.downloadText(r2Config, key);
  if (!content) return [];
  try {
    const entries = JSON.parse(content) as AILogEntry[];
    saveLog(key, entries);
    return entries;
  } catch {
    return [];
  }
};
