export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  parentId?: string; // 一级分类为空，二级分类为父级ID
  icon?: string;
  sortOrder: number;
}

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'securities' | 'wechat' | 'alipay' | 'cash' | 'other';
  currency: string;
  balance: number;
  isMain: boolean; // 主账户（人民币）
  exchangeRate?: number; // 对人民币汇率
  color?: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO日期格式
  type: 'income' | 'expense';
  categoryId: string;
  subcategoryId?: string;
  amount: number;
  project?: string;
  accountId: string;
  payer?: string;
  note?: string;
  attachments?: string[]; // 图片附件路径
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  currency: string;
  rate: number; // 对人民币汇率
  updatedAt: string;
}

export interface AppSettings {
  aiAccounting: boolean;
  geminiToken?: string;
  mainCurrency: string; // 主货币，默认为CNY
  lastSyncTime?: string;
  r2Config?: {
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  };
}

export interface LocalStorageData {
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  exchangeRates: ExchangeRate[];
  settings: AppSettings;
  lastUpdated: string;
}

export interface CompressedDataPackage {
  version: string;
  timestamp: string;
  data: LocalStorageData;
  checksum: string; // 数据校验和
}

export enum ErrorType {
  STORAGE_ERROR = 'STORAGE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  SYNC_ERROR = 'SYNC_ERROR',
  AI_PARSE_ERROR = 'AI_PARSE_ERROR'
}

export interface AppError {
  type: ErrorType;
  message: string;
  details?: any;
  timestamp: string;
}
