export type AIQueueItem = {
  id: string;
  createdAt: string;
  type: 'text' | 'image';
  text?: string;
  imageData?: string;
  imageMeta?: {
    name?: string;
    size?: number;
    type?: string;
    hash?: string;
  };
};

const QUEUE_KEY = 'ai_queue';

const loadQueue = (): AIQueueItem[] => {
  const raw = localStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as AIQueueItem[];
  } catch {
    return [];
  }
};

const saveQueue = (queue: AIQueueItem[]) => {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

export const getQueue = () => loadQueue();

export const enqueue = (item: AIQueueItem) => {
  const queue = loadQueue();
  queue.push(item);
  saveQueue(queue);
  return queue;
};

export const dequeue = () => {
  const queue = loadQueue();
  const item = queue.shift();
  saveQueue(queue);
  return item;
};

export const removeFromQueue = (id: string) => {
  const queue = loadQueue().filter((item) => item.id !== id);
  saveQueue(queue);
};

export const clearQueue = () => {
  saveQueue([]);
};
