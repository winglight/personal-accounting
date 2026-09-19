export type AICallLog = {
  id: string;
  startedAt: string;
  completedAt?: string;
  type: 'text' | 'image';
  input: unknown;
  status: 'queued' | 'pending' | 'success' | 'error';
  response?: unknown;
};

const LOG_KEY = 'ai_recent_call_logs';
const LEGACY_PREFIX = 'ai_logs_';
const MAX_LOGS = 3;

const removeLegacyLogs = () => {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(LEGACY_PREFIX)) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
};

const loadLogs = (): AICallLog[] => {
  removeLegacyLogs();
  const raw = localStorage.getItem(LOG_KEY);
  if (!raw) return [];
  try {
    const logs = JSON.parse(raw) as AICallLog[];
    return Array.isArray(logs) ? logs.slice(0, MAX_LOGS) : [];
  } catch {
    return [];
  }
};

const saveLogs = (logs: AICallLog[]) => {
  localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
};

export const readRecentLogs = () => loadLogs();

export const startCallLog = (entry: Omit<AICallLog, 'completedAt' | 'response'>) => {
  const logs = loadLogs().filter(log => log.id !== entry.id);
  saveLogs([entry, ...logs]);
};

export const updateCallLogStatus = (id: string, status: AICallLog['status']) => {
  const logs = loadLogs();
  saveLogs(logs.map(log => log.id === id ? { ...log, status } : log));
};

export const finishCallLog = (
  id: string,
  response: unknown,
  status: Extract<AICallLog['status'], 'success' | 'error'>,
) => {
  const logs = loadLogs();
  saveLogs(logs.map(log => log.id === id ? {
    ...log,
    completedAt: new Date().toISOString(),
    response,
    status,
  } : log));
};
