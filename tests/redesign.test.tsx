import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../src/i18n';
import { AccountingPage } from '../src/pages/AccountingPage';
import { AccountsPage } from '../src/pages/AccountsPage';
import { RecordsPage } from '../src/pages/RecordsPage';
import { CategoriesPage } from '../src/pages/CategoriesPage';
import { StatisticsPage } from '../src/pages/StatisticsPage';
import { StoragePage } from '../src/pages/StoragePage';
import { ThemePicker } from '../src/components/ui/ThemePicker';
import { Layout } from '../src/components/layout/Layout';
import type { LocalStorageData, Transaction } from '../src/types';
const mock = vi.hoisted(() => ({ state: {} as LocalStorageData & { dispatch: ReturnType<typeof vi.fn>; syncError: string | null }, signOut: vi.fn() }));
vi.mock('../src/contexts/AppContext', () => ({ useAppContext: () => mock.state }));
vi.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u', name: 'Tester', email: 'test@example.invalid' }, signOut: mock.signOut }) }));
vi.mock('react-chartjs-2', () => ({ Bar: ({ data }: { data: unknown }) => <output data-testid="bar-chart">{JSON.stringify(data)}</output>, Line: ({ data }: { data: unknown }) => <output data-testid="line-chart">{JSON.stringify(data)}</output> }));
vi.mock('../src/utils/aiClient', () => ({ checkHealth: vi.fn(async () => ({ ok: true, message: 'ok' })), callAI: vi.fn(), callAIStream: vi.fn() }));
const today = new Date().toISOString().slice(0, 10);
const transaction = (partial: Partial<Transaction>): Transaction => ({ id: 't1', type: 'expense', date: today, amount: 12.34, categoryId: 'food', subcategoryId: 'lunch', accountId: 'cash', note: 'Lunch', createdAt: `${today}T12:00:00.000Z`, updatedAt: `${today}T12:00:00.000Z`, version: 1, ...partial });
function mount(component: React.ReactElement, route = '/') { return render(<MemoryRouter initialEntries={[route]}><I18nProvider language="zh">{component}</I18nProvider></MemoryRouter>); }
beforeEach(() => {
  localStorage.clear();
  mock.state = { categories: [{ id: 'food', name: '餐饮', type: 'expense', sortOrder: 1 }, { id: 'lunch', name: '午餐', parentId: 'food', type: 'expense', sortOrder: 1 }, { id: 'salary', name: '工资', type: 'income', sortOrder: 2 }], accounts: [{ id: 'cash', name: '现金', type: 'cash', currency: 'CNY', balance: 100, isMain: true }, { id: 'bank', name: '银行卡', type: 'bank', currency: 'CNY', balance: 200, isMain: false }, { id: 'usd', name: '美元', type: 'bank', currency: 'USD', balance: 50, isMain: false }], transactions: [], exchangeRates: [], settings: { language: 'zh', mainCurrency: 'CNY', aiConfig: { enabled: false, apiUrl: '', token: '', textModel: 'test-text', imageModel: 'test-image', templates: { text: 'text', image: 'image' } } }, lastUpdated: today, dispatch: vi.fn(), syncError: null };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
describe('real redesign components with controlled API state', () => {
  it('keeps manual fields and their draft when switching modes and themes', () => {
    mount(<><ThemePicker /><AccountingPage /></>);
    const amount = screen.getByLabelText('金额'); const note = screen.getByLabelText('备注');
    fireEvent.change(amount, { target: { value: '18.75' } }); fireEvent.change(note, { target: { value: '保留草稿' } });
    for (const label of ['日期', '分类', '子分类', '项目', '付款人']) expect(screen.getByLabelText(label)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'AI 记账' }));
    expect(screen.getByText('前往 AI 设置')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: '外观主题' }), { target: { value: 'graphite' } });
    fireEvent.click(screen.getByRole('button', { name: '手工记账' }));
    expect((amount as HTMLInputElement).value).toBe('18.75'); expect((note as HTMLInputElement).value).toBe('保留草稿'); expect(mock.state.dispatch).not.toHaveBeenCalled();
  });
  it('manual save retains the exact business fields and dispatch type', () => {
    mount(<AccountingPage />);
    fireEvent.change(screen.getByLabelText('金额'), { target: { value: '18.75' } });
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'food' } });
    fireEvent.change(screen.getByLabelText('子分类'), { target: { value: 'lunch' } });
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: 'Lunch' } });
    fireEvent.change(screen.getByLabelText('项目'), { target: { value: 'Trip' } });
    fireEvent.change(screen.getByLabelText('付款人'), { target: { value: 'Me' } });
    fireEvent.click(screen.getByRole('button', { name: '保存记录' }));
    expect(mock.state.dispatch).toHaveBeenCalledWith({ type: 'ADD_TRANSACTION', payload: expect.objectContaining({ amount: 18.75, accountId: 'cash', categoryId: 'food', subcategoryId: 'lunch', project: 'Trip', payer: 'Me', note: 'Lunch', type: 'expense' }) });
  });
  it('AI-enabled accounts still have a manual path and retain AI text draft across theme/mode changes', () => {
    mock.state.settings.aiConfig = { ...mock.state.settings.aiConfig, enabled: true, apiUrl: 'https://example.invalid/ai', token: 'test-placeholder' };
    mount(<><ThemePicker /><AccountingPage /></>, '/?mode=ai');
    const input = screen.getByPlaceholderText(/输入/); fireEvent.change(input, { target: { value: '午餐18元' } });
    fireEvent.click(screen.getByRole('button', { name: '手工记账' })); fireEvent.change(screen.getByRole('combobox', { name: '外观主题' }), { target: { value: 'violet' } }); fireEvent.click(screen.getByRole('button', { name: 'AI 记账' }));
    expect((input as HTMLInputElement).value).toBe('午餐18元'); expect(document.querySelector('input[type=file]')).toBeTruthy(); expect(mock.state.dispatch).not.toHaveBeenCalled();
  });
  it('transfer stays manual and dispatches one transfer, never an income or expense', () => {
    mount(<><ThemePicker /><AccountsPage /></>);
    fireEvent.click(screen.getAllByRole('button', { name: '转账' })[0]); const modal = screen.getByRole('dialog');
    fireEvent.change(within(modal).getByLabelText('金额'), { target: { value: '25' } });
    fireEvent.change(screen.getByRole('combobox', { name: '外观主题' }), { target: { value: 'amber' } });
    expect((within(modal).getByLabelText('金额') as HTMLInputElement).value).toBe('25'); expect(within(modal).queryByText(/AI/)).toBeNull();
    fireEvent.click(within(modal).getByRole('button', { name: '确认' }));
    expect(mock.state.dispatch).toHaveBeenCalledTimes(1); expect(mock.state.dispatch).toHaveBeenCalledWith({ type: 'ADD_TRANSACTION', payload: expect.objectContaining({ type: 'transfer', amount: 25, accountId: 'cash', targetAccountId: 'bank', categoryId: '' }) });
  });
  it('account edit remains unsaved through theme changes and keeps currency/main flag', () => {
    mount(<><ThemePicker /><AccountsPage /></>); fireEvent.click(screen.getByRole('button', { name: '编辑 现金' }));
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '旅行现金' } }); fireEvent.change(screen.getByRole('combobox', { name: '外观主题' }), { target: { value: 'warm' } });
    expect((screen.getByLabelText('名称') as HTMLInputElement).value).toBe('旅行现金'); expect((screen.getByLabelText('币种') as HTMLInputElement).value).toBe('CNY'); expect((screen.getByLabelText(/主账户/) as HTMLInputElement).checked).toBe(true); expect(mock.state.dispatch).not.toHaveBeenCalled();
  });
  it('record edit retains receipt metadata, attachments, project, payer and version', () => {
    mock.state.transactions = [transaction({ receiptId: 'receipt-1', receiptItemIndex: 2, receiptMeta: { merchant: 'Shop', currency: 'CNY', total: 12.34 }, attachments: ['receipt-local'], project: 'Trip', payer: 'Me' })];
    mount(<RecordsPage />); fireEvent.click(screen.getByRole('button', { name: '编辑' })); fireEvent.change(screen.getByLabelText('备注'), { target: { value: 'Updated' } }); fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(mock.state.dispatch).toHaveBeenCalledWith({ type: 'UPDATE_TRANSACTION', payload: { id: 't1', transaction: expect.objectContaining({ receiptId: 'receipt-1', receiptItemIndex: 2, attachments: ['receipt-local'], project: 'Trip', payer: 'Me', version: 1, note: 'Updated' }) } });
  });
  it('record filters retain expense/income, primary and secondary constraints and exclude transfers', () => {
    mock.state.transactions = [transaction({}), transaction({ id: 'other', type: 'income', categoryId: 'salary', subcategoryId: undefined, note: 'Income' }), transaction({ id: 'transfer', type: 'transfer', note: 'Transfer' })];
    mount(<RecordsPage />); expect(screen.queryByText('Transfer')).toBeNull(); fireEvent.change(screen.getByLabelText('收支类型'), { target: { value: 'income' } }); expect(screen.queryByText(/Lunch/)).toBeNull(); expect(screen.getByText(/Income/)).toBeTruthy();
  });
  it('category expansion is keyboard-accessible and editing remains available', () => {
    mount(<CategoriesPage />); const expand = screen.getByRole('button', { name: '餐饮' }); expect(expand.getAttribute('aria-expanded')).toBe('true'); fireEvent.click(expand); expect(expand.getAttribute('aria-expanded')).toBe('false'); fireEvent.click(expand); expect(screen.getByRole('button', { name: '编辑 午餐' })).toBeTruthy();
  });
  it('settings retain real AI models and never expose the removed migration export', () => {
    mount(<StoragePage />); expect(screen.queryByText(/导出|迁移/)).toBeNull(); fireEvent.change(screen.getByLabelText('智谱 API Key'), { target: { value: 'test-only-placeholder' } }); fireEvent.click(screen.getByRole('button', { name: /石墨主题/ })); expect(screen.getByDisplayValue('test-only-placeholder')).toBeTruthy(); expect(mock.state.dispatch).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '保存' })); expect(mock.state.dispatch).toHaveBeenCalledWith({ type: 'UPDATE_SETTINGS', payload: expect.objectContaining({ aiConfig: expect.objectContaining({ textModel: 'test-text', imageModel: 'test-image', templates: { text: 'text', image: 'image' }, token: 'test-only-placeholder' }) }) });
  });
  it('statistics paging is separate from aggregation and custom ranges remain available', () => {
    mock.state.transactions = [transaction({}), transaction({ id: 'usd-expense', amount: 500, accountId: 'usd' }), transaction({ id: 'transfer', amount: 1000, type: 'transfer' })];
    mount(<StatisticsPage />); const group = screen.getByRole('group', { name: '浏览范围' }); fireEvent.click(within(group).getByRole('button', { name: '年' })); fireEvent.click(screen.getByRole('button', { name: '上一年' })); fireEvent.click(screen.getByRole('button', { name: '本年' }));
    expect(screen.getByLabelText('趋势聚合粒度')).toBeTruthy(); fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-01-02' } }); expect(screen.getByRole('button', { name: '上一年' }).hasAttribute('disabled')).toBe(true); expect(screen.getByText(/自定义日期时暂停/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('统计币种'), { target: { value: 'USD' } }); expect(screen.getAllByTestId('bar-chart').some(el => el.textContent?.includes('500'))).toBe(true);
  });
  it('all six routes and both entry actions remain in the shared shell', () => {
    mount(<Layout />); const header = screen.getByRole('banner'); expect(within(header).getByRole('link', { name: 'AI 记账' }).getAttribute('href')).toBe('/?mode=ai'); expect(within(header).getByRole('link', { name: '手工记账' }).getAttribute('href')).toBe('/?mode=manual'); for (const target of ['/', '/records', '/statistics', '/accounts', '/categories', '/storage']) expect(document.querySelector(`nav a[href="${target}"]`)).toBeTruthy();
  });
});
