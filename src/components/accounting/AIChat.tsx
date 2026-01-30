import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { AIAccountingParser } from '../../utils/ai';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Send, Image as ImageIcon, Check, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Transaction } from '../../types';

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  parsedData?: Partial<Transaction>;
  status?: 'pending' | 'success' | 'error';
}

export const AIChat: React.FC = () => {
  const { settings, categories, accounts, dispatch } = useAppContext();
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'ai', content: 'Hello! I am your AI accounting assistant. You can tell me what you spent, or upload a receipt.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !settings.geminiToken) return;
    
    const userMsg: Message = { id: uuidv4(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await AIAccountingParser.parseText(input, settings.geminiToken);
      
      const aiMsg: Message = {
        id: uuidv4(),
        role: 'ai',
        content: 'Here is what I understood. Please confirm to save.',
        parsedData: result,
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) {
      setMessages(prev => [...prev, { id: uuidv4(), role: 'ai', content: 'Sorry, I failed to understand that. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings.geminiToken) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      const userMsg: Message = { id: uuidv4(), role: 'user', content: 'Uploaded an image' };
      setMessages(prev => [...prev, userMsg]);
      setLoading(true);

      try {
        const result = await AIAccountingParser.parseImage(base64, settings.geminiToken);
        const aiMsg: Message = {
          id: uuidv4(),
          role: 'ai',
          content: 'I analyzed your receipt. Please confirm details.',
          parsedData: result,
        };
        setMessages(prev => [...prev, aiMsg]);
      } catch (error) {
        setMessages(prev => [...prev, { id: uuidv4(), role: 'ai', content: 'Failed to process image.' }]);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = (msgId: string, data: Partial<Transaction>) => {
    // Basic fuzzy matching or default to first available
    const category = categories.find(c => 
      c.name.toLowerCase().includes(data.categoryId?.toLowerCase() || '') ||
      (data.note && c.name.toLowerCase().includes(data.note.toLowerCase()))
    ) || categories[0];
    
    const account = accounts.find(a => 
      a.name.toLowerCase().includes(data.accountId?.toLowerCase() || '')
    ) || accounts[0];

    dispatch({
      type: 'ADD_TRANSACTION',
      payload: {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        date: data.date || new Date().toISOString().split('T')[0],
        type: (data.type as any) || 'expense',
        amount: Number(data.amount) || 0,
        categoryId: category?.id || '',
        accountId: account?.id || '',
        note: data.note || '',
        project: data.project,
        payer: data.payer,
      } as Transaction
    });

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, status: 'success', content: 'Saved successfully!' } : m));
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg p-3 ${msg.role === 'user' ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-900'}`}>
              <p>{msg.content}</p>
              {msg.parsedData && !msg.status && (
                <div className="mt-3 bg-white p-2 rounded text-sm space-y-1 border border-gray-200">
                  <p><strong>Type:</strong> {msg.parsedData.type}</p>
                  <p><strong>Amount:</strong> {msg.parsedData.amount}</p>
                  <p><strong>Date:</strong> {msg.parsedData.date}</p>
                  <p><strong>Category:</strong> {msg.parsedData.categoryId || 'Unknown'}</p>
                  <p><strong>Note:</strong> {msg.parsedData.note}</p>
                  <div className="flex space-x-2 mt-2 pt-2 border-t border-gray-100">
                    <button 
                      onClick={() => handleConfirm(msg.id, msg.parsedData!)}
                      className="flex-1 bg-green-600 text-white py-1 px-2 rounded text-xs flex items-center justify-center"
                    >
                      <Check className="h-3 w-3 mr-1" /> Confirm
                    </button>
                    <button className="flex-1 bg-gray-200 text-gray-700 py-1 px-2 rounded text-xs flex items-center justify-center">
                      <X className="h-3 w-3 mr-1" /> Edit
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 border-t border-gray-100 flex items-center space-x-2">
        <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*"
            onChange={handleImageUpload}
        />
        <Button variant="ghost" size="sm" className="p-2" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="h-5 w-5 text-gray-500" />
        </Button>
        <Input 
          value={input} 
          onChange={e => setInput(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type here..." 
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={loading} size="sm">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
