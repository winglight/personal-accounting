import React, { createContext, useContext, useEffect, useReducer } from 'react';
import { 
  Category, Account, Transaction, ExchangeRate, AppSettings, LocalStorageData 
} from '../types';

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
  aiAccounting: false,
  mainCurrency: 'CNY',
};

const initialState: LocalStorageData = {
  categories: defaultCategories,
  accounts: defaultAccounts,
  transactions: [],
  exchangeRates: [],
  settings: defaultSettings,
  lastUpdated: new Date().toISOString(),
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
    return stored ? JSON.parse(stored) : initial;
  });

  useEffect(() => {
    localStorage.setItem('personal_accounting_data', JSON.stringify(state));
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
