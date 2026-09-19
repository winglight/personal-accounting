import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { Send, Image as ImageIcon, Check, X, RefreshCw } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../types';
import { useI18n } from '../../i18n';
import { buildPrompt } from '../../utils/promptTemplates';
import { chatCompletion, safeParseJson } from '../../utils/aiClient';
import { finishCallLog, startCallLog, updateCallLogStatus } from '../../utils/aiLogs';
import { AIQueueItem, dequeue, enqueue, getQueue, removeFromQueue } from '../../utils/aiQueue';
import { processReceiptImage } from '../../utils/receiptImage';

interface AIParsedText {
  date?: string;
  type?: 'income' | 'expense';
  amount?: number;
  category?: string;
  subcategory?: string;
  account?: string;
  note?: string;
  project?: string;
  payer?: string;
}

interface AIReceiptItem {
  name?: string;
  amount?: number;
  category?: string;
  subcategory?: string;
  account?: string;
  note?: string;
}

interface AIReceiptResult {
  receipt?: {
    merchant?: string;
    date?: string;
    total?: number;
    currency?: string;
  };
  items?: AIReceiptItem[];
}

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  createdAt: string;
  imageData?: string;
  parsedText?: AIParsedText;
  parsedReceipt?: AIReceiptResult;
  status?: 'queued' | 'processing' | 'success' | 'error';
  retryPayload?: AIQueueItem;
}

interface EditingTextState {
  msgId: string;
  data: AIParsedText;
}

interface EditingReceiptState {
  msgId: string;
  data: AIReceiptResult;
}

interface ImageMeta {
  name?: string;
  size?: number;
  type?: string;
  originalSize?: number;
  width?: number;
  height?: number;
  overTarget?: boolean;
}

const HISTORY_KEY = 'ai_chat_history';
const HISTORY_DAYS = 3;
const PENDING_IMAGE_KEY = 'ai_pending_image';

export const AIChat: React.FC = () => {
  const { settings, categories, accounts, transactions, dispatch } = useAppContext();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>(() => {
    const raw = localStorage.getItem(HISTORY_KEY);
    const fallback: Message[] = [{
      id: '1',
      role: 'ai',
      content: t('ai.hello'),
      createdAt: new Date().toISOString(),
    }];
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw) as Message[];
      const maxAge = HISTORY_DAYS * 24 * 60 * 60 * 1000;
      const now = Date.now();
      const filtered = parsed.filter(m => m.createdAt && now - new Date(m.createdAt).getTime() <= maxAge);
      return filtered.length > 0 ? filtered : fallback;
    } catch {
      return fallback;
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiOnline, setAiOnline] = useState(() => Boolean(
    settings.aiConfig?.enabled
    && settings.aiConfig?.token
    && settings.aiConfig?.apiUrl
    && navigator.onLine
  ));
  const [editingText, setEditingText] = useState<EditingTextState | null>(null);
  const [editingReceipt, setEditingReceipt] = useState<EditingReceiptState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingQueue = useRef(false);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const messageAiMap = useRef<Map<string, string>>(new Map());
  const canceledMessageIds = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const isPageVisibleRef = useRef(true);

  const safeSetMessages = useCallback((action: React.SetStateAction<Message[]>) => {
    if (!isMountedRef.current || !isPageVisibleRef.current) return;
    setMessages(action);
  }, []);

  const safeSetLoading = useCallback((value: boolean) => {
    if (!isMountedRef.current || !isPageVisibleRef.current) return;
    setLoading(value);
  }, []);

  const safeSetAiOnline = useCallback((value: boolean) => {
    if (!isMountedRef.current || !isPageVisibleRef.current) return;
    setAiOnline(value);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    isMountedRef.current = true;
    const controllers = abortControllers.current;
    return () => {
      isMountedRef.current = false;
      controllers.forEach(controller => controller.abort());
      controllers.clear();
    };
  }, []);

  useEffect(() => {
    isPageVisibleRef.current = document.visibilityState === 'visible';
    const handlePageHide = () => {
      isPageVisibleRef.current = false;
      abortControllers.current.forEach(controller => controller.abort());
      abortControllers.current.clear();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      isPageVisibleRef.current = true;
      if (event.persisted) {
        safeSetLoading(false);
        processingQueue.current = false;
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      isPageVisibleRef.current = visible;
      if (!visible) {
        abortControllers.current.forEach(controller => controller.abort());
        abortControllers.current.clear();
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [safeSetLoading]);

  useEffect(() => {
    const maxAge = HISTORY_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const trimmed = messages.filter(m => m.createdAt && now - new Date(m.createdAt).getTime() <= maxAge);
    if (trimmed.length !== messages.length) {
      safeSetMessages(trimmed);
      return;
    }
    const sanitized = trimmed.map(m => (
      m.imageData ? { ...m, imageData: undefined } : m
    ));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sanitized));
  }, [messages, safeSetMessages]);

  useEffect(() => {
    const queued = getQueue();
    if (queued.length === 0) return;
    safeSetMessages(prev => {
      const existing = new Set(prev.map(m => m.id));
      const appended = queued
        .filter(item => !existing.has(item.id))
        .map(item => ({
          id: item.id,
          role: 'user' as const,
          content: item.type === 'text' ? item.text || '' : t('ai.input.image'),
          createdAt: item.createdAt,
          status: 'queued' as const,
          imageData: item.type === 'image' ? item.imageData : undefined,
          retryPayload: item,
        }));
      return appended.length ? [...prev, ...appended] : prev;
    });
  }, [safeSetMessages, t]);

  useEffect(() => {
    const updateOnline = () => safeSetAiOnline(Boolean(
      navigator.onLine
      && settings.aiConfig?.enabled
      && settings.aiConfig?.token
      && settings.aiConfig?.apiUrl
    ));
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, [safeSetAiOnline, settings.aiConfig?.enabled, settings.aiConfig?.apiUrl, settings.aiConfig?.token]);

  const buildPromptVars = useCallback((inputText: string, hasImage: boolean) => {
    const recent = transactions.slice(-10).map(t => ({
      date: t.date,
      type: t.type,
      amount: t.amount,
      category: categories.find(c => c.id === t.categoryId)?.name || '',
      subcategory: categories.find(c => c.id === t.subcategoryId)?.name || '',
      account: accounts.find(a => a.id === t.accountId)?.name || '',
      note: t.note || '',
    }));
    return {
      input_text: inputText,
      input_image: hasImage ? 'image_data' : '',
      categories: categories.filter(c => !c.parentId).map(parent => {
        const children = categories.filter(child => child.parentId === parent.id).map(child => child.name);
        return children.length ? `${parent.name}（${children.join('、')}）` : parent.name;
      }).join(', '),
      accounts: accounts.map(a => a.name).join(', '),
      recent_transactions: JSON.stringify(recent),
      today: new Date().toISOString().split('T')[0],
      currency: settings.mainCurrency,
    };
  }, [accounts, categories, settings.mainCurrency, transactions]);

  const resolveCategory = (categoryName?: string, subcategoryName?: string) => {
    const normalizedCategory = categoryName?.trim().toLowerCase();
    const normalizedSubcategory = subcategoryName?.trim().toLowerCase();
    const namedPrimary = normalizedCategory
      ? categories.find(category => !category.parentId && category.name.toLowerCase().includes(normalizedCategory))
      : undefined;
    const namedSecondary = normalizedSubcategory
      ? categories.find(category => category.parentId && category.name.toLowerCase().includes(normalizedSubcategory))
      : undefined;
    const primary = namedPrimary
      || (namedSecondary ? categories.find(category => category.id === namedSecondary.parentId) : undefined)
      || categories.find(category => !category.parentId);
    const secondary = namedSecondary?.parentId === primary?.id ? namedSecondary : undefined;
    return { categoryId: primary?.id || '', subcategoryId: secondary?.id };
  };

  const resolveAccountId = (name?: string) => {
    if (!name) return accounts[0]?.id || '';
    const match = accounts.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
    return match?.id || accounts[0]?.id || '';
  };

  const parseOptionalNumber = (value: string) => {
    if (!value.trim()) return undefined;
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
  };

  const logUserMessage = useCallback((id: string, type: 'text' | 'image', content: unknown, status: 'success' | 'queued') => {
    startCallLog({
      id,
      startedAt: new Date().toISOString(),
      type,
      input: content,
      status: status === 'success' ? 'pending' : status,
    });
  }, []);

  const logAIResponse = useCallback((id: string, content: unknown, status: 'success' | 'error') => {
    finishCallLog(id, content, status);
  }, []);

  const computeHash = async (data: string) => {
    try {
      const buffer = new TextEncoder().encode(data);
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  };

  const buildParseErrorMessage = useCallback((error: unknown, raw: string) => {
    const message = error instanceof Error ? error.message : String(error);
    const trimmedRaw = raw.trim();
    if (!trimmedRaw || trimmedRaw === 'No response found') {
      return t('ai.parse.empty');
    }
    if (message.includes('Invalid JSON')) {
      return t('ai.parse.invalidJson');
    }
    if (message.startsWith('AI request failed')) {
      return t('ai.parse.requestFailed');
    }
    return t('ai.parse.errorWithReason', { reason: message });
  }, [t]);

  const sendToAI = useCallback(async (item: AIQueueItem, userMessageId?: string) => {
    if (!isMountedRef.current || !isPageVisibleRef.current) return;
    updateCallLogStatus(item.id, 'pending');
    if (userMessageId) {
      if (canceledMessageIds.current.has(userMessageId)) return;
      safeSetMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, status: 'processing' } : m));
    }
    const template = item.type === 'text' ? settings.aiConfig.templates.text : settings.aiConfig.templates.image;
    const prompt = buildPrompt(template, buildPromptVars(item.text || '', item.type === 'image'));

    const aiMessageId = uuidv4();
    if (userMessageId) {
      messageAiMap.current.set(userMessageId, aiMessageId);
    }
    safeSetMessages(prev => [
      ...prev,
      { id: aiMessageId, role: 'ai', content: '', status: 'processing', createdAt: new Date().toISOString() },
    ]);

    let rawResponse = '';
    try {
      let controller: AbortController | undefined;
      if (userMessageId) {
        controller = new AbortController();
        abortControllers.current.set(userMessageId, controller);
      }
      rawResponse = await chatCompletion({
        apiUrl: settings.aiConfig.apiUrl,
        token: settings.aiConfig.token,
        model: item.type === 'image' ? settings.aiConfig.imageModel : settings.aiConfig.textModel,
        signal: controller?.signal,
        message: {
          role: 'user',
          content: prompt,
          image_data: item.type === 'image' ? item.imageData : undefined,
        },
      });
      if (userMessageId && canceledMessageIds.current.has(userMessageId)) {
        return;
      }
      const parsed = safeParseJson<unknown>(rawResponse);
      if (!parsed) throw new Error('Invalid JSON');

      if (item.type === 'image') {
        const parsedReceipt = parsed as AIReceiptResult;
        const receipt: AIReceiptResult = {
          receipt: parsedReceipt.receipt,
          items: Array.isArray(parsedReceipt.items) ? parsedReceipt.items : [],
        };
        safeSetMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: t('ai.parse.receipt'), parsedReceipt: receipt, status: undefined } : m));
        logAIResponse(item.id, receipt, 'success');
      } else {
        const parsedText: AIParsedText = parsed;
        safeSetMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: t('ai.parse.text'), parsedText, status: undefined } : m));
        logAIResponse(item.id, parsedText, 'success');
      }
      if (userMessageId) {
        safeSetMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, status: 'success' } : m));
      }
    } catch (error) {
      const isCanceled = userMessageId && canceledMessageIds.current.has(userMessageId);
      if (isCanceled) return;
      if (error instanceof DOMException && error.name === 'AbortError') {
        logAIResponse(item.id, { error: '请求已中止' }, 'error');
        return;
      }
      const errorMessage = buildParseErrorMessage(error, rawResponse);
      safeSetMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: errorMessage, status: 'error' } : m));
      logAIResponse(item.id, { error: String(error), rawResponse }, 'error');
      const ok = navigator.onLine;
      if (!ok) {
        safeSetAiOnline(false);
        enqueue(item);
        if (userMessageId) {
          safeSetMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, status: 'queued' } : m));
        }
      } else if (userMessageId) {
        safeSetMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, status: 'error' } : m));
      }
    } finally {
      if (userMessageId) {
        abortControllers.current.delete(userMessageId);
        messageAiMap.current.delete(userMessageId);
        canceledMessageIds.current.delete(userMessageId);
      }
    }
  }, [
    buildParseErrorMessage,
    buildPromptVars,
    logAIResponse,
    safeSetAiOnline,
    safeSetMessages,
    settings.aiConfig.apiUrl,
    settings.aiConfig.imageModel,
    settings.aiConfig.textModel,
    settings.aiConfig.templates.image,
    settings.aiConfig.templates.text,
    settings.aiConfig.token,
    t,
  ]);

  const processQueue = useCallback(async () => {
    if (processingQueue.current) return;
    processingQueue.current = true;
    let item: AIQueueItem | undefined;
    while ((item = dequeue())) {
      await sendToAI(item, item.id);
    }
    processingQueue.current = false;
  }, [sendToAI]);

  useEffect(() => {
    if (aiOnline) {
      processQueue();
    }
  }, [aiOnline, processQueue]);

  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_IMAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        id: string;
        createdAt: string;
        dataUrl: string;
        meta: ImageMeta;
      };
      if (!parsed?.id || !parsed.dataUrl) {
        sessionStorage.removeItem(PENDING_IMAGE_KEY);
        return;
      }
      const exists = getQueue().some(item => item.id === parsed.id);
      if (!exists) {
        enqueue({
          id: parsed.id,
          createdAt: parsed.createdAt,
          type: 'image',
          imageData: parsed.dataUrl,
          imageMeta: parsed.meta,
        });
      }
      sessionStorage.removeItem(PENDING_IMAGE_KEY);
      if (aiOnline) {
        processQueue();
      }
    } catch {
      sessionStorage.removeItem(PENDING_IMAGE_KEY);
    }
  }, [aiOnline, processQueue]);

  const handleSend = async () => {
    if (!input.trim() || !settings.aiConfig?.token) return;
    const id = uuidv4();
    const queueItem: AIQueueItem = {
      id,
      createdAt: new Date().toISOString(),
      type: 'text',
      text: input,
    };
    const userMsg: Message = {
      id,
      role: 'user',
      content: input,
      createdAt: queueItem.createdAt,
      status: aiOnline ? 'processing' : 'queued',
      retryPayload: queueItem,
    };
    safeSetMessages(prev => [...prev, userMsg]);

    setInput('');
    if (!aiOnline) {
      enqueue(queueItem);
      logUserMessage(id, 'text', input, 'queued');
      return;
    }

    safeSetLoading(true);
    logUserMessage(id, 'text', input, 'success');
    await sendToAI(queueItem, id);
    safeSetLoading(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings.aiConfig?.token) return;
    if (input.trim()) return;
    await prepareAndSendImage(file);
    e.target.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!settings.aiConfig?.token) return;
    if (input.trim()) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    const blob = imageItem.getAsFile();
    if (!blob) return;
    e.preventDefault();
    const file = new File([blob], `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`, { type: blob.type });
    await prepareAndSendImage(file);
  };

  async function prepareAndSendImage(file: File) {
    safeSetLoading(true);
    try {
      const processed = await processReceiptImage(file, true);
      if (!isMountedRef.current || !isPageVisibleRef.current) return;
      const pendingId = uuidv4();
      const createdAt = new Date().toISOString();
      const meta: ImageMeta = {
        name: processed.file.name,
        size: processed.outputBytes,
        type: processed.file.type,
        originalSize: processed.originalBytes,
        width: processed.width,
        height: processed.height,
        overTarget: processed.overTarget,
      };
      sessionStorage.setItem(PENDING_IMAGE_KEY, JSON.stringify({
        id: pendingId,
        createdAt,
        dataUrl: processed.dataUrl,
        meta,
      }));
      await sendImageNow(meta, processed.dataUrl, { id: pendingId, createdAt });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      safeSetMessages(previous => [...previous, {
        id: uuidv4(),
        role: 'ai',
        content: t('ai.image.processFailed', { reason }),
        createdAt: new Date().toISOString(),
        status: 'error',
      }]);
    } finally {
      safeSetLoading(false);
    }
  }

  async function sendImageNow(meta: ImageMeta, dataUrl: string, preset?: { id: string; createdAt: string }) {
    if (!settings.aiConfig?.token) return;
    if (!isMountedRef.current || !isPageVisibleRef.current) return;
    const id = preset?.id || uuidv4();
    const createdAt = preset?.createdAt || new Date().toISOString();
    const hash = await computeHash(dataUrl);
    if (!isMountedRef.current || !isPageVisibleRef.current) return;
    const imageMeta = { ...meta, hash };

    const queueItem: AIQueueItem = {
      id,
      createdAt,
      type: 'image',
      imageData: dataUrl,
      imageMeta,
    };

    const userMsg: Message = {
      id,
      role: 'user',
      content: t('ai.input.image'),
      createdAt,
      imageData: dataUrl,
      status: aiOnline ? 'processing' : 'queued',
      retryPayload: queueItem,
    };
    safeSetMessages(prev => [...prev, userMsg]);

    const contentForLog = imageMeta;
    const existing = getQueue().some(item => item.id === id);
    if (!existing) {
      enqueue(queueItem);
    }
    sessionStorage.removeItem(PENDING_IMAGE_KEY);
    if (!aiOnline) {
      logUserMessage(id, 'image', contentForLog, 'queued');
      return;
    }
    safeSetLoading(true);
    logUserMessage(id, 'image', contentForLog, 'success');
    await processQueue();
    safeSetLoading(false);
  }

  const handleConfirmText = (msgId: string, data: AIParsedText) => {
    const { categoryId, subcategoryId } = resolveCategory(data.category, data.subcategory);
    const accountId = resolveAccountId(data.account);

    dispatch({
      type: 'ADD_TRANSACTION',
      payload: {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        date: data.date || new Date().toISOString().split('T')[0],
        type: data.type || 'expense',
        amount: Number(data.amount) || 0,
        categoryId,
        subcategoryId,
        accountId,
        note: data.note || '',
        project: data.project,
        payer: data.payer,
      } as Transaction
    });

    safeSetMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', content: t('ai.saved') } : m));
  };

  const handleConfirmReceipt = (msgId: string, receipt: AIReceiptResult) => {
    const items = receipt.items || [];
    const receiptId = uuidv4();
    items.forEach((item, index) => {
      const { categoryId, subcategoryId } = resolveCategory(item.category, item.subcategory);
      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          date: receipt.receipt?.date || new Date().toISOString().split('T')[0],
          type: 'expense',
          amount: Number(item.amount) || 0,
          categoryId,
          subcategoryId,
          accountId: resolveAccountId(item.account),
          note: item.name || item.note || '',
          receiptId,
          receiptItemIndex: index,
          receiptMeta: receipt.receipt,
        } as Transaction
      });
    });

    safeSetMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', content: t('ai.saved') } : m));
  };

  const openTextEditor = (msgId: string, data: AIParsedText) => {
    setEditingText({ msgId, data: { ...data } });
  };

  const openReceiptEditor = (msgId: string, data: AIReceiptResult) => {
    setEditingReceipt({
      msgId,
      data: {
        receipt: data.receipt ? { ...data.receipt } : undefined,
        items: (data.items || []).map(item => ({ ...item })),
      },
    });
  };

  const saveTextEdit = () => {
    if (!editingText) return;
    safeSetMessages(prev => prev.map(m => (
      m.id === editingText.msgId
        ? { ...m, parsedText: editingText.data }
        : m
    )));
    setEditingText(null);
  };

  const saveReceiptEdit = () => {
    if (!editingReceipt) return;
    safeSetMessages(prev => prev.map(m => (
      m.id === editingReceipt.msgId
        ? { ...m, parsedReceipt: editingReceipt.data }
        : m
    )));
    setEditingReceipt(null);
  };

  const updateReceiptItem = (index: number, patch: Partial<AIReceiptItem>) => {
    setEditingReceipt(prev => {
      if (!prev) return prev;
      const items = [...(prev.data.items || [])];
      items[index] = { ...items[index], ...patch };
      return { ...prev, data: { ...prev.data, items } };
    });
  };

  const primaryCategoryOptions = (type: 'income' | 'expense') => [
    { value: '', label: t('accounting.selectCategory') },
    ...categories
      .filter(category => !category.parentId && category.type === type)
      .map(category => ({ value: category.name, label: category.name })),
  ];

  const subcategoryOptions = (categoryName?: string, type: 'income' | 'expense' = 'expense') => {
    const primaryCategory = categories.find(category => (
      !category.parentId
      && category.type === type
      && category.name === categoryName
    ));

    return [
      { value: '', label: t('common.none') },
      ...categories
        .filter(category => category.parentId === primaryCategory?.id)
        .map(category => ({ value: category.name, label: category.name })),
    ];
  };

  const accountOptions = [
    { value: '', label: t('accounting.selectAccount') },
    ...accounts.map(account => ({ value: account.name, label: account.name })),
  ];

  const handleCancelSend = (messageId: string) => {
    removeFromQueue(messageId);
    finishCallLog(messageId, { error: '用户取消了本次调用' }, 'error');
    canceledMessageIds.current.add(messageId);
    const controller = abortControllers.current.get(messageId);
    if (controller) controller.abort();
    const aiMessageId = messageAiMap.current.get(messageId);
    safeSetMessages(prev => prev.filter(m => m.id !== messageId && m.id !== aiMessageId));
  };

  const handleDiscard = (messageId: string) => {
    safeSetMessages(prev => prev.map(m => (
      m.id === messageId
        ? { ...m, status: 'success', content: t('ai.discarded'), parsedReceipt: undefined, parsedText: undefined }
        : m
    )));
  };

  const isImageDisabled = Boolean(input.trim());
  const handleRetry = async (message: Message) => {
    if (!message.retryPayload) return;
    if (!aiOnline) {
      enqueue(message.retryPayload);
    safeSetMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'queued' } : m));
      return;
    }
    safeSetMessages(prev => prev.map(m => m.id === message.id ? { ...m, status: 'processing' } : m));
    await sendToAI(message.retryPayload, message.id);
  };

  return (
    <>
      <div className="flex flex-col h-[calc(100vh-10rem)] bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`flex w-full min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="w-fit min-w-0 max-w-[80%] rounded-lg bg-green-100 p-3 text-green-900">
                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                  {msg.imageData && (
                    <img src={msg.imageData} alt="" className="mt-2 max-h-40 rounded border border-green-200" />
                  )}
                  {msg.status === 'processing' && !msg.content && (
                    <div className="text-xs text-gray-500 mt-2">{t('ai.processing')}</div>
                  )}
                  {msg.status === 'queued' && (
                    <div className="text-xs text-gray-500 mt-2">{t('ai.queued')}</div>
                  )}
                {((msg.status === 'queued' || msg.status === 'processing') || msg.status === 'error') && (
                  <div className="mt-2 flex justify-end gap-2">
                    {(msg.status === 'queued' || msg.status === 'processing') && (
                      <button
                        type="button"
                        onClick={() => handleCancelSend(msg.id)}
                        className="h-8 rounded-full border border-gray-300 px-2 text-xs text-gray-600 hover:border-red-400 hover:text-red-600"
                      >
                        {t('ai.recall')}
                      </button>
                    )}
                    {msg.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => handleRetry(msg)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-600"
                        aria-label="Retry"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-fit min-w-0 max-w-[80%] rounded-lg bg-gray-100 p-3 text-gray-900">
                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</p>
                {msg.status === 'processing' && !msg.content && (
                  <div className="text-xs text-gray-500 mt-2">{t('ai.processing')}</div>
                )}
                {msg.status === 'queued' && (
                  <div className="text-xs text-gray-500 mt-2">{t('ai.queued')}</div>
                )}
                {msg.parsedText && !msg.status && (
                  <div className="mt-3 bg-white p-2 rounded text-sm space-y-1 border border-gray-200">
                    <p><strong>{t('accounting.type')}:</strong> {msg.parsedText.type}</p>
                    <p><strong>{t('accounting.amount')}:</strong> {msg.parsedText.amount}</p>
                    <p><strong>{t('accounting.date')}:</strong> {msg.parsedText.date}</p>
                    <p><strong>{t('accounting.category')}:</strong> {msg.parsedText.category || t('common.none')}</p>
                    <p><strong>{t('accounting.note')}:</strong> {msg.parsedText.note}</p>
                    <div className="flex space-x-2 mt-2 pt-2 border-t border-gray-100">
                      <button 
                        onClick={() => handleConfirmText(msg.id, msg.parsedText!)}
                        className="flex-1 bg-green-600 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
                      >
                        <Check className="h-3 w-3 mr-1" /> {t('ai.confirm')}
                      </button>
                      <button
                        onClick={() => openTextEditor(msg.id, msg.parsedText!)}
                        className="flex-1 bg-gray-200 text-gray-700 py-1 px-2 rounded text-xs flex items-center justify-center"
                      >
                        <X className="h-3 w-3 mr-1" /> {t('ai.edit')}
                      </button>
                    </div>
                  </div>
                )}
                {msg.parsedReceipt && !msg.status && (
                  <div className="mt-3 bg-white p-2 rounded text-sm space-y-2 border border-gray-200">
                    <div className="text-xs text-gray-500">
                      {msg.parsedReceipt.receipt?.merchant || ''} {msg.parsedReceipt.receipt?.date || ''}
                    </div>
                    <div className="space-y-1">
                      {(msg.parsedReceipt.items || []).map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span>{item.name || t('common.none')}</span>
                          <span>{item.amount ?? 0}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex space-x-2 mt-2 pt-2 border-t border-gray-100">
                      <button
                        onClick={() => handleConfirmReceipt(msg.id, msg.parsedReceipt!)}
                        className="flex-1 bg-green-600 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
                      >
                        <Check className="h-3 w-3 mr-1" /> {t('ai.confirmAll')}
                      </button>
                      <button
                        onClick={() => openReceiptEditor(msg.id, msg.parsedReceipt!)}
                        className="flex-1 bg-gray-200 text-gray-700 py-1 px-2 rounded text-xs flex items-center justify-center"
                      >
                        <X className="h-3 w-3 mr-1" /> {t('ai.edit')}
                      </button>
                      <button
                        onClick={() => handleDiscard(msg.id)}
                        className="flex-1 bg-gray-200 text-gray-700 py-1 px-2 rounded text-xs flex items-center justify-center"
                      >
                        <X className="h-3 w-3 mr-1" /> {t('ai.discard')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
        <div className="p-3 border-t border-gray-100 space-y-2">
          <div className="flex items-center space-x-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="image/*"
                onChange={handleImageUpload}
            />
            <Button
              variant="ghost"
              size="sm"
              className="p-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImageDisabled}
            >
                <ImageIcon className="h-5 w-5 text-gray-500" />
            </Button>
            <Input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              onPaste={handlePaste}
              placeholder={t('ai.input.placeholder')} 
              className="flex-1"
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()} size="sm">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          {!aiOnline && settings.aiConfig?.enabled && (
            <div className="text-xs text-amber-600">{t('ai.offlineQueued')}</div>
          )}
        </div>
      </div>
      <Modal
        isOpen={Boolean(editingText)}
        onClose={() => setEditingText(null)}
        title={t('ai.edit')}
      >
        {editingText && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('accounting.type')}</label>
                <select
                  className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  value={editingText.data.type || 'expense'}
                  onChange={e => setEditingText(prev => prev ? {
                    ...prev,
                    data: {
                      ...prev.data,
                      type: e.target.value as 'income' | 'expense',
                      category: '',
                      subcategory: '',
                    },
                  } : prev)}
                >
                  <option value="expense">{t('accounting.expense')}</option>
                  <option value="income">{t('accounting.income')}</option>
                </select>
              </div>
              <Input
                label={t('accounting.amount')}
                type="number"
                step="0.01"
                value={editingText.data.amount ?? ''}
                onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, amount: parseOptionalNumber(e.target.value) } } : prev)}
              />
            </div>
            <Input
              label={t('accounting.date')}
              type="date"
              value={editingText.data.date || ''}
              onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, date: e.target.value } } : prev)}
            />
            <Select
              label={t('accounting.category')}
              value={editingText.data.category || ''}
              options={primaryCategoryOptions(editingText.data.type || 'expense')}
              onChange={e => setEditingText(prev => prev ? {
                ...prev,
                data: { ...prev.data, category: e.target.value, subcategory: '' },
              } : prev)}
            />
            <Select
              label={t('accounting.subcategory')}
              value={editingText.data.subcategory || ''}
              options={subcategoryOptions(editingText.data.category, editingText.data.type || 'expense')}
              onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, subcategory: e.target.value } } : prev)}
              disabled={!editingText.data.category || subcategoryOptions(editingText.data.category, editingText.data.type || 'expense').length === 1}
            />
            <Select
              label={t('accounting.account')}
              value={editingText.data.account || ''}
              options={accountOptions}
              onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, account: e.target.value } } : prev)}
            />
            <Input
              label={t('accounting.note')}
              value={editingText.data.note || ''}
              onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, note: e.target.value } } : prev)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('accounting.project')}
                value={editingText.data.project || ''}
                onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, project: e.target.value } } : prev)}
              />
              <Input
                label={t('accounting.payer')}
                value={editingText.data.payer || ''}
                onChange={e => setEditingText(prev => prev ? { ...prev, data: { ...prev.data, payer: e.target.value } } : prev)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditingText(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={saveTextEdit}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(editingReceipt)}
        onClose={() => setEditingReceipt(null)}
        title={t('ai.edit')}
      >
        {editingReceipt && (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={t('accounting.date')}
                type="date"
                value={editingReceipt.data.receipt?.date || ''}
                onChange={e => setEditingReceipt(prev => prev ? {
                  ...prev,
                  data: { ...prev.data, receipt: { ...(prev.data.receipt || {}), date: e.target.value } },
                } : prev)}
              />
              <Input
                label={t('records.receipt')}
                value={editingReceipt.data.receipt?.merchant || ''}
                onChange={e => setEditingReceipt(prev => prev ? {
                  ...prev,
                  data: { ...prev.data, receipt: { ...(prev.data.receipt || {}), merchant: e.target.value } },
                } : prev)}
              />
            </div>
            {(editingReceipt.data.items || []).map((item, idx) => (
              <div key={idx} className="rounded border border-gray-200 p-3 space-y-2">
                <div className="text-xs text-gray-500">#{idx + 1}</div>
                <Input
                  label={t('accounting.note')}
                  value={item.name || ''}
                  onChange={e => updateReceiptItem(idx, { name: e.target.value })}
                />
                <Input
                  label={t('accounting.amount')}
                  type="number"
                  step="0.01"
                  value={item.amount ?? ''}
                  onChange={e => updateReceiptItem(idx, { amount: parseOptionalNumber(e.target.value) })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label={t('accounting.category')}
                    value={item.category || ''}
                    options={primaryCategoryOptions('expense')}
                    onChange={e => updateReceiptItem(idx, { category: e.target.value, subcategory: '' })}
                  />
                  <Select
                    label={t('accounting.subcategory')}
                    value={item.subcategory || ''}
                    options={subcategoryOptions(item.category)}
                    onChange={e => updateReceiptItem(idx, { subcategory: e.target.value })}
                    disabled={!item.category || subcategoryOptions(item.category).length === 1}
                  />
                  <Select
                    label={t('accounting.account')}
                    value={item.account || ''}
                    options={accountOptions}
                    onChange={e => updateReceiptItem(idx, { account: e.target.value })}
                  />
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setEditingReceipt(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={saveReceiptEdit}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};
