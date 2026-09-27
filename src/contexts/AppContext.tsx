import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react';
import type { Account, AppSettings, Category, ExchangeRate, LocalStorageData, Transaction } from '../types';
import { fetchData, sendAction } from '../utils/api';
import { getDefaultTemplates } from '../utils/promptTemplates';

const defaultSettings: AppSettings = {
  language: 'zh',
  aiConfig: {
    enabled: false,
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    token: '',
    textModel: 'glm-5.3-flash',
    imageModel: 'glm-4.6v-flashx',
    templates: getDefaultTemplates(),
  },
  mainCurrency: 'CNY', version: 1,
};

const initialState: LocalStorageData = {
  categories: [], accounts: [], transactions: [], exchangeRates: [],
  settings: defaultSettings, lastUpdated: new Date().toISOString(),
};

const applyTransactionBalance = (accounts: Account[], tx: Transaction, direction: 1 | -1) => accounts.map(account => {
  if (tx.type === 'transfer') {
    if (account.id === tx.accountId) return { ...account, balance: account.balance - tx.amount * direction };
    if (account.id === tx.targetAccountId) return { ...account, balance: account.balance + tx.amount * direction };
    return account;
  }
  if (account.id !== tx.accountId) return account;
  return { ...account, balance: account.balance + tx.amount * (tx.type === 'income' ? 1 : -1) * direction };
});

export type Action =
  | { type: 'SET_DATA'; payload: LocalStorageData }
  | { type: 'ADD_CATEGORY'; payload: Category }
  | { type: 'UPDATE_CATEGORY'; payload: { id: string; category: Partial<Category> } }
  | { type: 'DELETE_CATEGORY'; payload: string }
  | { type: 'ADD_ACCOUNT'; payload: Account }
  | { type: 'UPDATE_ACCOUNT'; payload: { id: string; account: Partial<Account> } }
  | { type: 'DELETE_ACCOUNT'; payload: string }
  | { type: 'ADD_TRANSACTION'; payload: Transaction }
  | { type: 'UPDATE_TRANSACTION'; payload: { id: string; transaction: Partial<Transaction> } }
  | { type: 'DELETE_TRANSACTION'; payload: string }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<AppSettings> }
  | { type: 'UPDATE_RATES'; payload: ExchangeRate[] };

const bump = (version?: number) => (version || 1) + 1;

const appReducer = (state: LocalStorageData, action: Action): LocalStorageData => {
  if (action.type === 'SET_DATA') return action.payload;
  const next = { ...state, lastUpdated: new Date().toISOString() };
  switch (action.type) {
    case 'ADD_CATEGORY': return { ...next, categories: [...state.categories, { ...action.payload, version: 1 }] };
    case 'UPDATE_CATEGORY': return { ...next, categories: state.categories.map(c => c.id === action.payload.id ? { ...c, ...action.payload.category, version: bump(c.version) } : c) };
    case 'DELETE_CATEGORY': return { ...next, categories: state.categories.filter(c => c.id !== action.payload) };
    case 'ADD_ACCOUNT': return { ...next, accounts: [...state.accounts, { ...action.payload, version: 1 }] };
    case 'UPDATE_ACCOUNT': return { ...next, accounts: state.accounts.map(a => a.id === action.payload.id ? { ...a, ...action.payload.account, version: bump(a.version) } : a) };
    case 'DELETE_ACCOUNT': return { ...next, accounts: state.accounts.filter(a => a.id !== action.payload) };
    case 'ADD_TRANSACTION': {
      const tx = { ...action.payload, version: 1 };
      return { ...next, transactions: [...state.transactions, tx], accounts: applyTransactionBalance(state.accounts, tx, 1) };
    }
    case 'UPDATE_TRANSACTION': {
      const oldTx = state.transactions.find(t => t.id === action.payload.id);
      if (!oldTx) return next;
      const tx = { ...oldTx, ...action.payload.transaction, version: bump(oldTx.version) };
      return { ...next, transactions: state.transactions.map(t => t.id === tx.id ? tx : t), accounts: applyTransactionBalance(applyTransactionBalance(state.accounts, oldTx, -1), tx, 1) };
    }
    case 'DELETE_TRANSACTION': {
      const tx = state.transactions.find(t => t.id === action.payload);
      return tx ? { ...next, transactions: state.transactions.filter(t => t.id !== tx.id), accounts: applyTransactionBalance(state.accounts, tx, -1) } : next;
    }
    case 'UPDATE_SETTINGS': return { ...next, settings: { ...state.settings, ...action.payload, version: bump(state.settings.version) } };
    case 'UPDATE_RATES': return { ...next, exchangeRates: action.payload };
  }
};

interface AppContextType extends LocalStorageData {
  dispatch: React.Dispatch<Action>;
  syncError: string | null;
}
const AppContext = createContext<AppContextType | undefined>(undefined);

const withVersion = (action: Action, state: LocalStorageData): Action => {
  if (action.type === 'UPDATE_CATEGORY') return { ...action, payload: { ...action.payload, category: { ...action.payload.category, version: state.categories.find(x => x.id === action.payload.id)?.version } } };
  if (action.type === 'DELETE_CATEGORY') return { ...action, payload: JSON.stringify({ id: action.payload, version: state.categories.find(x => x.id === action.payload)?.version }) };
  if (action.type === 'UPDATE_ACCOUNT') return { ...action, payload: { ...action.payload, account: { ...action.payload.account, version: state.accounts.find(x => x.id === action.payload.id)?.version } } };
  if (action.type === 'DELETE_ACCOUNT') return { ...action, payload: JSON.stringify({ id: action.payload, version: state.accounts.find(x => x.id === action.payload)?.version }) };
  if (action.type === 'UPDATE_TRANSACTION') return { ...action, payload: { ...action.payload, transaction: { ...action.payload.transaction, version: state.transactions.find(x => x.id === action.payload.id)?.version } } };
  if (action.type === 'DELETE_TRANSACTION') return { ...action, payload: JSON.stringify({ id: action.payload, version: state.transactions.find(x => x.id === action.payload)?.version }) };
  if (action.type === 'UPDATE_SETTINGS') return { ...action, payload: { ...action.payload, version: state.settings.version } };
  return action;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, localDispatch] = useReducer(appReducer, initialState);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const stateRef = useRef(state);
  const queue = useRef(Promise.resolve());
  useEffect(() => { stateRef.current = state; }, [state]);

  const reload = useCallback(async () => {
    const data = await fetchData();
    stateRef.current = data;
    localDispatch({ type: 'SET_DATA', payload: data });
    setSyncError(null);
  }, []);
  useEffect(() => { reload().catch(error => setSyncError(error instanceof Error ? error.message : String(error))).finally(() => setLoading(false)); }, [reload]);

  const dispatch = useCallback((action: Action) => {
    if (action.type === 'SET_DATA') { stateRef.current = action.payload; localDispatch(action); return; }
    const enriched = withVersion(action, stateRef.current);
    stateRef.current = appReducer(stateRef.current, action);
    localDispatch(action);
    queue.current = queue.current.then(async () => { await sendAction(enriched); }).catch(async error => {
      setSyncError(error instanceof Error ? error.message : String(error));
      await reload().catch(() => undefined);
    });
  }, [reload]);

  if (loading) return <div className="min-h-screen grid place-items-center text-gray-500">正在加载账本…</div>;
  if (syncError && state.categories.length === 0) return <div className="min-h-screen grid place-items-center p-6 text-red-600">无法加载账本：{syncError}</div>;
  return <AppContext.Provider value={{ ...state, dispatch, syncError }}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
