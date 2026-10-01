import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AppProvider, useAppContext } from '../src/contexts/AppContext';
import type { LocalStorageData, Transaction } from '../src/types';
const api = vi.hoisted(() => ({ fetchData: vi.fn(), sendAction: vi.fn() }));
vi.mock('../src/utils/api', () => api);
let app: ReturnType<typeof useAppContext>;
function Probe() { app = useAppContext(); return <output data-testid="state">{JSON.stringify({ accounts: app.accounts, transactions: app.transactions })}</output>; }
let fixture: LocalStorageData;
beforeEach(() => {
  api.fetchData.mockReset(); api.sendAction.mockReset();
  fixture = { categories: [{ id: 'food', name: 'Food', type: 'expense', sortOrder: 1, version: 2 }], accounts: [{ id: 'cash', name: 'Cash', type: 'cash', currency: 'CNY', balance: 100, isMain: true, version: 4 }, { id: 'bank', name: 'Bank', type: 'bank', currency: 'CNY', balance: 200, isMain: false, version: 1 }], transactions: [], exchangeRates: [], settings: { language: 'zh', mainCurrency: 'CNY', version: 2, aiConfig: { enabled: false, apiUrl: '', token: '', textModel: 'text', imageModel: 'image', templates: { text: 't', image: 'i' } } }, lastUpdated: '2026-10-01' };
  api.fetchData.mockResolvedValue(fixture); api.sendAction.mockResolvedValue({ ok: true });
});
async function mount() { render(<AppProvider><Probe /></AppProvider>); await screen.findByTestId('state'); }
const tx = (patch: Partial<Transaction> = {}): Transaction => ({ id: 't', date: '2026-10-01', type: 'expense', categoryId: 'food', accountId: 'cash', amount: 25, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', ...patch });
it('optimistic dispatch updates UI before the unresolved server operation completes', async () => {
  let finish!: () => void; api.sendAction.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; })); await mount();
  act(() => app.dispatch({ type: 'ADD_TRANSACTION', payload: tx() }));
  expect(app.accounts[0].balance).toBe(75); expect(app.transactions).toHaveLength(1);
  await waitFor(() => expect(api.sendAction).toHaveBeenCalledTimes(1));
  await act(async () => finish()); expect(app.accounts[0].balance).toBe(75);
});
it('rapid edits retain version enrichment and serialize API writes', async () => {
  let finish!: () => void; api.sendAction.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValueOnce({ ok: true }); await mount();
  act(() => { app.dispatch({ type: 'UPDATE_ACCOUNT', payload: { id: 'cash', account: { name: 'One' } } }); app.dispatch({ type: 'UPDATE_ACCOUNT', payload: { id: 'cash', account: { name: 'Two' } } }); });
  await waitFor(() => expect(api.sendAction).toHaveBeenCalledTimes(1)); expect(app.accounts[0].name).toBe('Two');
  expect(api.sendAction.mock.calls[0][0].payload.account.version).toBe(4);
  await act(async () => finish()); await waitFor(() => expect(api.sendAction).toHaveBeenCalledTimes(2)); expect(api.sendAction.mock.calls[1][0].payload.account.version).toBe(5);
});
it('transfer and delete maintain both local balances and delete version contract', async () => {
  await mount(); act(() => app.dispatch({ type: 'ADD_TRANSACTION', payload: tx({ type: 'transfer', targetAccountId: 'bank', categoryId: '' }) }));
  expect(app.accounts.map(a => a.balance)).toEqual([75, 225]);
  act(() => app.dispatch({ type: 'DELETE_TRANSACTION', payload: 't' })); expect(app.accounts.map(a => a.balance)).toEqual([100, 200]);
  await waitFor(() => expect(api.sendAction).toHaveBeenCalledTimes(2)); expect(JSON.parse(api.sendAction.mock.calls[1][0].payload)).toEqual({ id: 't', version: 1 });
});
it('failed mutation reloads authoritative data instead of keeping the optimistic row', async () => {
  api.sendAction.mockRejectedValue(new Error('409 version conflict')); await mount();
  act(() => app.dispatch({ type: 'ADD_TRANSACTION', payload: tx() })); expect(app.transactions).toHaveLength(1);
  await waitFor(() => expect(api.fetchData).toHaveBeenCalledTimes(2)); await waitFor(() => expect(app.transactions).toHaveLength(0)); expect(app.accounts[0].balance).toBe(100);
});
it('record edits reverse the original effect and keep receipt fields intact', async () => {
  fixture.transactions = [tx({ receiptId: 'receipt', attachments: ['image-path'], version: 6 })]; fixture.accounts[0].balance = 75; await mount();
  act(() => app.dispatch({ type: 'UPDATE_TRANSACTION', payload: { id: 't', transaction: { amount: 10, accountId: 'bank' } } }));
  expect(app.accounts.map(a => a.balance)).toEqual([100, 190]); expect(app.transactions[0]).toMatchObject({ amount: 10, accountId: 'bank', receiptId: 'receipt', attachments: ['image-path'], version: 7 });
  await waitFor(() => expect(api.sendAction).toHaveBeenCalledTimes(1)); expect(api.sendAction.mock.calls[0][0].payload.transaction.version).toBe(6);
});
