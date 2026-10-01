import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../src/i18n';
import { AIChat } from '../src/components/accounting/AIChat';
import { ThemePicker } from '../src/components/ui/ThemePicker';
const mock = vi.hoisted(() => ({ dispatch: vi.fn(), complete: vi.fn() }));
vi.mock('../src/contexts/AppContext', () => ({ useAppContext: () => ({ settings: { mainCurrency: 'CNY', aiConfig: { enabled: true, token: 'test-placeholder', apiUrl: 'https://example.invalid/ai', textModel: 'text-model', imageModel: 'image-model', templates: { text: '{{input_text}}', image: 'receipt' } } }, categories: [{ id: 'food', name: '餐饮', type: 'expense' }, { id: 'lunch', parentId: 'food', name: '午餐', type: 'expense' }], accounts: [{ id: 'cash', name: '现金', currency: 'CNY', balance: 100 }], transactions: [], dispatch: mock.dispatch }) }));
vi.mock('../src/utils/aiClient', () => ({ chatCompletion: mock.complete, safeParseJson: (raw: string) => JSON.parse(raw) }));
const now = () => new Date().toISOString();
const parsedText = { date: now().slice(0, 10), type: 'expense', amount: 12, category: '餐饮', subcategory: '午餐', account: '现金', note: 'Lunch', project: 'Trip', payer: 'Me' };
const receipt = { receipt: { merchant: 'Shop', date: now().slice(0, 10), total: 15, currency: 'CNY' }, items: [{ name: 'Food', amount: 10, category: '餐饮', account: '现金' }, { name: 'Tea', amount: 5, category: '餐饮', account: '现金' }] };
function mount() { return render(<I18nProvider language="zh"><ThemePicker /><AIChat /></I18nProvider>); }
function history(value: unknown) { localStorage.setItem('ai_chat_history', JSON.stringify(value)); }
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mock.dispatch.mockClear(); mock.complete.mockReset(); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); });
it('AI text review editing survives theme switch and only confirmation dispatches once', () => {
  history([{ id: 'review', role: 'ai', content: 'Review', createdAt: now(), parsedText }]); mount(); expect(mock.dispatch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '编辑' })); const modal = screen.getByRole('dialog'); fireEvent.change(within(modal).getByLabelText('金额'), { target: { value: '19' } });
  fireEvent.change(screen.getByLabelText('外观主题'), { target: { value: 'violet' } }); expect((within(modal).getByLabelText('金额') as HTMLInputElement).value).toBe('19');
  fireEvent.click(within(modal).getByRole('button', { name: '保存' })); expect(mock.dispatch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '确认' }));
  expect(mock.dispatch).toHaveBeenCalledTimes(1); expect(mock.dispatch.mock.calls[0][0].payload).toMatchObject({ amount: 19, categoryId: 'food', subcategoryId: 'lunch', accountId: 'cash', project: 'Trip', payer: 'Me' }); expect(screen.queryByRole('button', { name: '确认' })).toBeNull();
});
it('receipt confirm preserves shared receipt metadata and item ordering', () => {
  history([{ id: 'receipt', role: 'ai', content: 'Review', createdAt: now(), parsedReceipt: receipt }]); mount(); fireEvent.click(screen.getByRole('button', { name: '确认全部' }));
  expect(mock.dispatch).toHaveBeenCalledTimes(2); const first = mock.dispatch.mock.calls[0][0].payload, second = mock.dispatch.mock.calls[1][0].payload;
  expect(first).toMatchObject({ type: 'expense', amount: 10, receiptItemIndex: 0, receiptMeta: receipt.receipt }); expect(second).toMatchObject({ amount: 5, receiptItemIndex: 1, receiptId: first.receiptId });
});
it('receipt discard creates no transaction', () => {
  history([{ id: 'receipt', role: 'ai', content: 'Review', createdAt: now(), parsedReceipt: receipt }]); mount(); fireEvent.click(screen.getByRole('button', { name: '放弃' })); expect(mock.dispatch).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: '确认全部' })).toBeNull();
});
it('offline queue survives theme switching and can be recalled without AI calls', () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  localStorage.setItem('ai_queue', JSON.stringify([{ id: 'queued', createdAt: now(), type: 'text', text: 'Queued lunch' }])); mount();
  fireEvent.change(screen.getByLabelText('外观主题'), { target: { value: 'amber' } }); expect(JSON.parse(localStorage.getItem('ai_queue')!)).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '撤回' })); expect(JSON.parse(localStorage.getItem('ai_queue')!)).toHaveLength(0); expect(mock.complete).not.toHaveBeenCalled(); expect(mock.dispatch).not.toHaveBeenCalled();
});
it('retry uses text model and still requires review confirmation', async () => {
  history([{ id: 'failed', role: 'user', content: 'Lunch', createdAt: now(), status: 'error', retryPayload: { id: 'failed', createdAt: now(), type: 'text', text: 'Lunch' } }]); mock.complete.mockResolvedValue(JSON.stringify(parsedText)); mount(); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('button', { name: '确认' }); expect(mock.complete).toHaveBeenCalledTimes(1); expect(mock.complete.mock.calls[0][0]).toMatchObject({ model: 'text-model' }); expect(mock.dispatch).not.toHaveBeenCalled();
});
it('queued receipt uses image model and image payload without automatic saving', async () => {
  localStorage.setItem('ai_queue', JSON.stringify([{ id: 'image', createdAt: now(), type: 'image', imageData: 'data:image/png;base64,dGVzdA==' }])); mock.complete.mockResolvedValue(JSON.stringify(receipt)); mount();
  await screen.findByRole('button', { name: '确认全部' }); await waitFor(() => expect(mock.complete).toHaveBeenCalledTimes(1)); expect(mock.complete.mock.calls[0][0]).toMatchObject({ model: 'image-model', message: { image_data: 'data:image/png;base64,dGVzdA==' } }); expect(mock.dispatch).not.toHaveBeenCalled();
});
