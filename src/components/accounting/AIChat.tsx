import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Send, Image as ImageIcon, Check, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../types';
import { useI18n } from '../../i18n';
import { buildPrompt } from '../../utils/promptTemplates';
import { checkHealth, safeParseJson, streamChat } from '../../utils/aiClient';
import { appendLog } from '../../utils/aiLogs';
import { AIQueueItem, dequeue, enqueue, getQueue } from '../../utils/aiQueue';

interface AIParsedText {
  date?: string;
  type?: 'income' | 'expense';
  amount?: number;
  category?: string;
  account?: string;
  note?: string;
  project?: string;
  payer?: string;
}

interface AIReceiptItem {
  name?: string;
  amount?: number;
  category?: string;
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
  parsedText?: AIParsedText;
  parsedReceipt?: AIReceiptResult;
  status?: 'queued' | 'streaming' | 'success' | 'error';
}

type ImageState = {
  file: File;
  dataUrl: string;
};

export const AIChat: React.FC = () => {
  const { settings, categories, accounts, transactions, dispatch } = useAppContext();
  const { t } = useI18n();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', content: t('ai.hello') }
  ]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageState | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionStarted = useRef(false);
  const processingQueue = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const queued = getQueue();
    if (queued.length > 0) {
      setMessages(prev => [
        ...prev,
        ...queued.map(item => ({
          id: item.id,
          role: 'user' as const,
          content: item.type === 'text' ? item.text || '' : t('ai.input.image'),
          status: 'queued' as const,
        })),
      ]);
    }
  }, [t]);

  useEffect(() => {
    if (!settings.aiConfig?.enabled) return;
    let mounted = true;
    const check = async () => {
      const ok = await checkHealth(settings.aiConfig.baseUrl, settings.aiConfig.token);
      if (mounted) setAiOnline(ok);
    };
    check();
    const timer = window.setInterval(check, 10000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [settings.aiConfig?.enabled, settings.aiConfig?.baseUrl, settings.aiConfig?.token]);

  const buildPromptVars = useCallback((inputText: string, hasImage: boolean) => {
    const recent = transactions.slice(-10).map(t => ({
      date: t.date,
      type: t.type,
      amount: t.amount,
      category: categories.find(c => c.id === t.categoryId)?.name || '',
      account: accounts.find(a => a.id === t.accountId)?.name || '',
      note: t.note || '',
    }));
    return {
      input_text: inputText,
      input_image: hasImage ? 'image_data' : '',
      categories: categories.map(c => c.name).join(', '),
      accounts: accounts.map(a => a.name).join(', '),
      recent_transactions: JSON.stringify(recent),
      today: new Date().toISOString().split('T')[0],
      currency: settings.mainCurrency,
    };
  }, [accounts, categories, settings.mainCurrency, transactions]);

  const resolveCategoryId = (name?: string) => {
    if (!name) return categories[0]?.id || '';
    const match = categories.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
    return match?.id || categories[0]?.id || '';
  };

  const resolveAccountId = (name?: string) => {
    if (!name) return accounts[0]?.id || '';
    const match = accounts.find(a => a.name.toLowerCase().includes(name.toLowerCase()));
    return match?.id || accounts[0]?.id || '';
  };

  const logUserMessage = useCallback(async (id: string, type: 'text' | 'image', content: unknown, status: 'success' | 'queued') => {
    await appendLog({
      id,
      timestamp: new Date().toISOString(),
      direction: 'user',
      contentType: type,
      content,
      status,
    }, settings.r2Config);
  }, [settings.r2Config]);

  const logAIResponse = useCallback(async (id: string, content: unknown, status: 'success' | 'error') => {
    await appendLog({
      id,
      timestamp: new Date().toISOString(),
      direction: 'ai',
      contentType: 'json',
      content,
      status,
    }, settings.r2Config);
  }, [settings.r2Config]);

  const computeHash = async (data: string) => {
    try {
      const buffer = new TextEncoder().encode(data);
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  };

  const sendToAI = useCallback(async (item: AIQueueItem, userMessageId?: string) => {
    const template = item.type === 'text' ? settings.aiConfig.templates.text : settings.aiConfig.templates.image;
    const prompt = buildPrompt(template, buildPromptVars(item.text || '', item.type === 'image'));

    const aiMessageId = uuidv4();
    setMessages(prev => [
      ...prev,
      { id: aiMessageId, role: 'ai', content: '', status: 'streaming' },
    ]);

    let rawResponse = '';
    try {
      rawResponse = await streamChat({
        baseUrl: settings.aiConfig.baseUrl,
        token: settings.aiConfig.token,
        model: settings.aiConfig.model,
        isNewSession: !sessionStarted.current,
        message: {
          role: 'user',
          content: prompt,
          image_data: item.type === 'image' ? item.imageData : undefined,
        },
        onDelta: (delta) => {
          setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: m.content + delta } : m));
        },
      });
      sessionStarted.current = true;
      const parsed = safeParseJson<unknown>(rawResponse);
      if (!parsed) throw new Error('Invalid JSON');

      if (item.type === 'image') {
        const parsedReceipt = parsed as AIReceiptResult;
        const receipt: AIReceiptResult = {
          receipt: parsedReceipt.receipt,
          items: Array.isArray(parsedReceipt.items) ? parsedReceipt.items : [],
        };
        setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: t('ai.parse.receipt'), parsedReceipt: receipt, status: undefined } : m));
        await logAIResponse(aiMessageId, receipt, 'success');
      } else {
        const parsedText: AIParsedText = parsed;
        setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: t('ai.parse.text'), parsedText, status: undefined } : m));
        await logAIResponse(aiMessageId, parsedText, 'success');
      }
      if (userMessageId) {
        setMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, status: 'success' } : m));
      }
    } catch (error) {
      setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: t('ai.parse.failed'), status: 'error' } : m));
      await logAIResponse(aiMessageId, { error: String(error), rawResponse }, 'error');
      const ok = await checkHealth(settings.aiConfig.baseUrl, settings.aiConfig.token);
      if (!ok) {
        setAiOnline(false);
        enqueue(item);
        if (userMessageId) {
          setMessages(prev => prev.map(m => m.id === userMessageId ? { ...m, status: 'queued' } : m));
        }
      }
    }
  }, [
    buildPromptVars,
    logAIResponse,
    settings.aiConfig.baseUrl,
    settings.aiConfig.model,
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

  const handleSend = async () => {
    if (!input.trim() || !settings.aiConfig?.token) return;
    if (selectedImage) return;
    const id = uuidv4();
    const userMsg: Message = { id, role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);

    const queueItem: AIQueueItem = {
      id,
      createdAt: new Date().toISOString(),
      type: 'text',
      text: input,
    };

    setInput('');
    if (!aiOnline) {
      enqueue(queueItem);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'queued' } : m));
      await logUserMessage(id, 'text', input, 'queued');
      return;
    }

    setLoading(true);
    await logUserMessage(id, 'text', input, 'success');
    await sendToAI(queueItem, id);
    setLoading(false);
  };

  const handleImageSelect = async (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setSelectedImage({ file, dataUrl: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings.aiConfig?.token) return;
    if (input.trim()) return;
    handleImageSelect(file);
  };

  const sendImage = async () => {
    if (!selectedImage || !settings.aiConfig?.token) return;
    const id = uuidv4();
    const userMsg: Message = { id, role: 'user', content: t('ai.input.image') };
    setMessages(prev => [...prev, userMsg]);

    const hash = settings.aiConfig.logImageMode === 'metadata'
      ? await computeHash(selectedImage.dataUrl)
      : '';
    const contentForLog = settings.aiConfig.logImageMode === 'full'
      ? selectedImage.dataUrl
      : { name: selectedImage.file.name, size: selectedImage.file.size, type: selectedImage.file.type, hash };

    const queueItem: AIQueueItem = {
      id,
      createdAt: new Date().toISOString(),
      type: 'image',
      imageData: selectedImage.dataUrl,
      imageMeta: {
        name: selectedImage.file.name,
        size: selectedImage.file.size,
        type: selectedImage.file.type,
        hash,
      },
    };

    setSelectedImage(null);
    if (!aiOnline) {
      enqueue(queueItem);
      setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'queued' } : m));
      await logUserMessage(id, 'image', contentForLog, 'queued');
      return;
    }
    setLoading(true);
    await logUserMessage(id, 'image', contentForLog, 'success');
    await sendToAI(queueItem, id);
    setLoading(false);
  };

  const handleConfirmText = (msgId: string, data: AIParsedText) => {
    const categoryId = resolveCategoryId(data.category);
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
        accountId,
        note: data.note || '',
        project: data.project,
        payer: data.payer,
      } as Transaction
    });

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', content: t('ai.saved') } : m));
  };

  const handleConfirmReceipt = (msgId: string, receipt: AIReceiptResult) => {
    const items = receipt.items || [];
    const receiptId = uuidv4();
    items.forEach((item, index) => {
      dispatch({
        type: 'ADD_TRANSACTION',
        payload: {
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          date: receipt.receipt?.date || new Date().toISOString().split('T')[0],
          type: 'expense',
          amount: Number(item.amount) || 0,
          categoryId: resolveCategoryId(item.category),
          accountId: resolveAccountId(item.account),
          note: item.name || item.note || '',
          receiptId,
          receiptItemIndex: index,
          receiptMeta: receipt.receipt,
        } as Transaction
      });
    });

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', content: t('ai.saved') } : m));
  };

  const isTextDisabled = Boolean(selectedImage);
  const isImageDisabled = Boolean(input.trim());

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-900'}`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
              {msg.status === 'streaming' && !msg.content && (
                <div className="text-xs text-gray-500 mt-2">{t('ai.streaming')}</div>
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
                    <button className="flex-1 bg-gray-200 text-gray-700 py-1 px-2 rounded text-xs flex items-center justify-center">
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
                    <button className="flex-1 bg-gray-200 text-gray-700 py-1 px-2 rounded text-xs flex items-center justify-center">
                      <X className="h-3 w-3 mr-1" /> {t('ai.edit')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-gray-100 space-y-2">
        {selectedImage && (
          <div className="flex items-center justify-between bg-gray-50 p-2 rounded">
            <div className="text-xs text-gray-600 truncate">{selectedImage.file.name}</div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedImage(null)}>
              {t('ai.input.clearImage')}
            </Button>
          </div>
        )}
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
            placeholder={t('ai.input.placeholder')} 
            className="flex-1"
            disabled={isTextDisabled}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim() || isTextDisabled} size="sm">
            <Send className="h-4 w-4" />
          </Button>
          <Button onClick={sendImage} disabled={loading || !selectedImage} size="sm" variant="secondary">
            {t('ai.input.image')}
          </Button>
        </div>
        {!aiOnline && settings.aiConfig?.enabled && (
          <div className="text-xs text-amber-600">{t('ai.offlineQueued')}</div>
        )}
      </div>
    </div>
  );
};
