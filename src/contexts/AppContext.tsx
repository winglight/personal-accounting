import React, { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { 
  Category, Account, Transaction, ExchangeRate, AppSettings, LocalStorageData 
} from '../types';
import { R2SyncManager } from '../utils/r2Sync';
import { getDefaultTemplates } from '../utils/promptTemplates';

// Initial Data
const defaultCategories: Category[] = [
  { id: '1', name: 'Catering', type: 'expense', sortOrder: 1, icon: 'Utensils' },
  { id: '2', name: 'Traffic', type: 'expense', sortOrder: 2, icon: 'Bus' },
  { id: '3', name: 'Shopping', type: 'expense', sortOrder: 3, icon: 'ShoppingBag' },
  { id: '4', name: 'Entertainment', type: 'expense', sortOrder: 4, icon: 'Film' },
  { id: '5', name: 'Medical', type: 'expense', sortOrder: 5, icon: 'Activity' },
  { id: '6', name: 'Education', type: 'expense', sortOrder: 6, icon: 'Book' },
  { id: '101', name: 'Salary', type: 'income', sortOrder: 1, icon: 'Banknote' },
  { id: '102', name: 'Bonus', type: 'income', sortOrder: 2, icon: 'Gift' },
  { id: '103', name: 'Investment', type: 'income', sortOrder: 3, icon: 'TrendingUp' },
];

const defaultAccounts: Account[] = [
  { id: '1', name: 'Cash', type: 'cash', currency: 'CNY', balance: 0, isMain: true },
  { id: '2', name: 'Bank Card', type: 'bank', currency: 'CNY', balance: 0, isMain: false },
  { id: '3', name: 'WeChat', type: 'wechat', currency: 'CNY', balance: 0, isMain: false },
  { id: '4', name: 'Alipay', type: 'alipay', currency: 'CNY', balance: 0, isMain: false },
];

const defaultSettings: AppSettings = {
  language: 'zh',
  aiConfig: {
    enabled: false,
    baseUrl: 'http://localhost:8000',
    token: '',
    stream: true,
    logImageMode: 'metadata',
    templates: getDefaultTemplates(),
  },
  mainCurrency: 'CNY',
  r2Config: {
    enabled: false,
    app: '',
    url: '',
    token: '',
  },
};

const initialState: LocalStorageData = {
  categories: defaultCategories,
  accounts: defaultAccounts,
  transactions: [],
  exchangeRates: [],
  settings: defaultSettings,
  lastUpdated: new Date().toISOString(),
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null;

const migrateSettings = (settings: unknown): AppSettings => {
  const base = isRecord(settings) ? settings : {};
  const aiConfigInput = isRecord(base.aiConfig) ? base.aiConfig : {};
  const templateInput = isRecord(aiConfigInput.templates) ? aiConfigInput.templates : {};

  const templates = typeof templateInput.text === 'string' && typeof templateInput.image === 'string'
    ? { text: templateInput.text, image: templateInput.image }
    : getDefaultTemplates();

  const logImageMode: AppSettings['aiConfig']['logImageMode'] = aiConfigInput.logImageMode === 'full'
    ? 'full'
    : 'metadata';

  const aiConfig: AppSettings['aiConfig'] = isRecord(base.aiConfig) ? {
    enabled: Boolean(aiConfigInput.enabled),
    baseUrl: typeof aiConfigInput.baseUrl === 'string' ? aiConfigInput.baseUrl : 'http://localhost:8000',
    token: typeof aiConfigInput.token === 'string' ? aiConfigInput.token : '',
    model: typeof aiConfigInput.model === 'string' ? aiConfigInput.model : undefined,
    stream: true as const,
    logImageMode,
    templates,
  } : {
    enabled: Boolean(base.aiAccounting),
    baseUrl: 'http://localhost:8000',
    token: typeof base.geminiToken === 'string' ? base.geminiToken : '',
    stream: true as const,
    logImageMode: 'metadata' as const,
    templates,
  };

  const r2Input = isRecord(base.r2Config) ? base.r2Config : undefined;
  const r2Config = r2Input && typeof r2Input.url === 'string' ? {
    enabled: Boolean(r2Input.enabled),
    app: typeof r2Input.app === 'string' ? r2Input.app : '',
    url: r2Input.url,
    token: typeof r2Input.token === 'string' ? r2Input.token : '',
  } : {
    enabled: false,
    app: '',
    url: '',
    token: '',
  };

  return {
    language: base.language === 'en' ? 'en' : 'zh',
    aiConfig,
    mainCurrency: typeof base.mainCurrency === 'string' ? base.mainCurrency : 'CNY',
    lastSyncTime: typeof base.lastSyncTime === 'string' ? base.lastSyncTime : undefined,
    r2Config,
  };
};

const migrateState = (state: unknown): LocalStorageData => {
  const base = isRecord(state) ? state : {};
  return {
    categories: Array.isArray(base.categories) ? (base.categories as Category[]) : defaultCategories,
    accounts: Array.isArray(base.accounts) ? (base.accounts as Account[]) : defaultAccounts,
    transactions: Array.isArray(base.transactions) ? (base.transactions as Transaction[]) : [],
    exchangeRates: Array.isArray(base.exchangeRates) ? (base.exchangeRates as ExchangeRate[]) : [],
    settings: migrateSettings(base.settings),
    lastUpdated: typeof base.lastUpdated === 'string' ? base.lastUpdated : new Date().toISOString(),
  };
};

// Actions
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

// Reducer
const appReducer = (state: LocalStorageData, action: Action): LocalStorageData => {
  const newState = { ...state, lastUpdated: new Date().toISOString() };
  switch (action.type) {
    case 'SET_DATA':
      return action.payload;
    case 'ADD_CATEGORY':
      return { ...newState, categories: [...state.categories, action.payload] };
    case 'UPDATE_CATEGORY':
      return {
        ...newState,
        categories: state.categories.map(c => c.id === action.payload.id ? { ...c, ...action.payload.category } : c),
      };
    case 'DELETE_CATEGORY':
      return {
        ...newState,
        categories: state.categories.filter(c => c.id !== action.payload),
      };
    case 'ADD_ACCOUNT':
      return { ...newState, accounts: [...state.accounts, action.payload] };
    case 'UPDATE_ACCOUNT':
      return {
        ...newState,
        accounts: state.accounts.map(a => a.id === action.payload.id ? { ...a, ...action.payload.account } : a),
      };
    case 'DELETE_ACCOUNT':
      return {
        ...newState,
        accounts: state.accounts.filter(a => a.id !== action.payload),
      };
    case 'ADD_TRANSACTION': {
      // Update account balance
      const tx = action.payload;
      const account = state.accounts.find(a => a.id === tx.accountId);
      let updatedAccounts = state.accounts;
      if (account) {
        const balanceChange = tx.type === 'income' ? tx.amount : -tx.amount;
        updatedAccounts = state.accounts.map(a => a.id === tx.accountId ? { ...a, balance: a.balance + balanceChange } : a);
      }
      return { ...newState, transactions: [...state.transactions, tx], accounts: updatedAccounts };
    }
      
    case 'UPDATE_TRANSACTION': {
      const oldTx = state.transactions.find(t => t.id === action.payload.id);
      if (!oldTx) return newState;
      
      const newTxData = { ...oldTx, ...action.payload.transaction };
      
      // Revert old
      const oldAccount = state.accounts.find(a => a.id === oldTx.accountId);
      let tempAccounts = state.accounts;
      if (oldAccount) {
        const revertChange = oldTx.type === 'income' ? -oldTx.amount : oldTx.amount;
        tempAccounts = tempAccounts.map(a => a.id === oldTx.accountId ? { ...a, balance: a.balance + revertChange } : a);
      }
      
      // Apply new
      const newAccount = tempAccounts.find(a => a.id === newTxData.accountId);
      if (newAccount) {
        const applyChange = newTxData.type === 'income' ? newTxData.amount : -newTxData.amount;
        tempAccounts = tempAccounts.map(a => a.id === newTxData.accountId ? { ...a, balance: a.balance + applyChange } : a);
      }
      
      return {
        ...newState,
        transactions: state.transactions.map(t => t.id === action.payload.id ? newTxData : t),
        accounts: tempAccounts
      };
    }

    case 'DELETE_TRANSACTION': {
       const delTx = state.transactions.find(t => t.id === action.payload);
       if (!delTx) return newState;
       
       // Revert balance
       const delAccount = state.accounts.find(a => a.id === delTx.accountId);
       let delAccounts = state.accounts;
       if (delAccount) {
         const revertDel = delTx.type === 'income' ? -delTx.amount : delTx.amount;
         delAccounts = delAccounts.map(a => a.id === delTx.accountId ? { ...a, balance: a.balance + revertDel } : a);
       }
       
       return {
         ...newState,
         transactions: state.transactions.filter(t => t.id !== action.payload),
         accounts: delAccounts
       };
    }

    case 'UPDATE_SETTINGS':
      return { ...newState, settings: { ...state.settings, ...action.payload } };
    case 'UPDATE_RATES':
      return { ...newState, exchangeRates: action.payload };
    default:
      return state;
  }
};

// Context
interface AppContextType extends LocalStorageData {
  dispatch: React.Dispatch<Action>;
  importData: (data: LocalStorageData) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState, (initial) => {
    const stored = localStorage.getItem('personal_accounting_data');
    if (!stored) return initial;
    try {
      return migrateState(JSON.parse(stored));
    } catch {
      return initial;
    }
  });
  const initialSyncDone = useRef(false);
  const suppressNextUpload = useRef(false);
  const uploadTimeout = useRef<number | null>(null);

  useEffect(() => {
    localStorage.setItem('personal_accounting_data', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const config = state.settings.r2Config;
    if (!config?.enabled || !config.url || !config.app || !config.token) {
      initialSyncDone.current = true;
      return;
    }
    initialSyncDone.current = false;
    let cancelled = false;
    const runSync = async () => {
      try {
        const remoteData = await R2SyncManager.download<LocalStorageData>(config, 'backup');
        if (cancelled || !remoteData) return;
        const remoteUpdated = remoteData.lastUpdated;
        const localUpdated = state.lastUpdated;
        if (!localUpdated || (remoteUpdated && new Date(remoteUpdated) > new Date(localUpdated))) {
          suppressNextUpload.current = true;
          dispatch({ type: 'SET_DATA', payload: remoteData });
        }
      } catch (e) {
        console.warn('R2 initial sync failed:', e);
      } finally {
        if (!cancelled) initialSyncDone.current = true;
      }
    };
    runSync();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.r2Config?.enabled, state.settings.r2Config?.url, state.settings.r2Config?.app, state.settings.r2Config?.token]);

  useEffect(() => {
    const config = state.settings.r2Config;
    if (!config?.enabled || !config.url || !config.app || !config.token) {
      return;
    }
    let cancelled = false;
    const syncConfig = async () => {
      try {
        const remoteConfig = await R2SyncManager.downloadJson<Partial<AppSettings>>(config, 'config');
        if (cancelled || !remoteConfig) return;
        const merged = migrateSettings({ ...state.settings, ...remoteConfig, r2Config: state.settings.r2Config });
        const currentComparable = JSON.stringify({ ...state.settings, r2Config: undefined });
        const remoteComparable = JSON.stringify({ ...merged, r2Config: undefined });
        if (currentComparable !== remoteComparable) {
          dispatch({ type: 'UPDATE_SETTINGS', payload: { ...merged, r2Config: state.settings.r2Config } });
        }
      } catch (e) {
        console.warn('R2 config sync failed:', e);
      }
    };
    syncConfig();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.settings.r2Config?.enabled, state.settings.r2Config?.url, state.settings.r2Config?.app, state.settings.r2Config?.token]);

  useEffect(() => {
    const config = state.settings.r2Config;
    if (!initialSyncDone.current) return;
    if (!config?.enabled || !config.url || !config.app || !config.token) return;
    if (suppressNextUpload.current) {
      suppressNextUpload.current = false;
      return;
    }
    if (uploadTimeout.current) window.clearTimeout(uploadTimeout.current);
    uploadTimeout.current = window.setTimeout(() => {
      R2SyncManager.upload(state, config, 'backup').catch((e) => {
        console.warn('R2 upload failed:', e);
      });
    }, 1200);
    return () => {
      if (uploadTimeout.current) window.clearTimeout(uploadTimeout.current);
    };
  }, [state]);

  const importData = (data: LocalStorageData) => {
    dispatch({ type: 'SET_DATA', payload: data });
  };

  return (
    <AppContext.Provider value={{ ...state, dispatch, importData }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
};
