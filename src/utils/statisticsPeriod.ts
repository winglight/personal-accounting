import type { Account, Category, Transaction } from '../types';

export type StatisticsPeriod = 'day' | 'week' | 'month' | 'year';
export interface StatisticsDateRange { start: string; end: string }
const PERIODS: StatisticsPeriod[] = ['day', 'week', 'month', 'year'];
const MIN_DATE = '0001-01-01';
const MAX_DATE = '9999-12-31';

/** Ledger dates are calendar dates, never elapsed 24-hour intervals in local time. */
export function isStatisticsDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_DATE || value > MAX_DATE) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function calendarDate(value: string): Date {
  if (!isStatisticsDate(value)) throw new RangeError('Invalid calendar date');
  return new Date(`${value}T00:00:00Z`);
}

function dateKey(date: Date): string {
  const value = date.toISOString().slice(0, 10);
  if (!isStatisticsDate(value)) throw new RangeError('Calendar date outside supported range');
  return value;
}

function boundedDateKey(date: Date): string {
  if (date.getUTCFullYear() < 1) return MIN_DATE;
  if (date.getUTCFullYear() > 9999) return MAX_DATE;
  return dateKey(date);
}

function checkPeriod(period: StatisticsPeriod): void {
  if (!PERIODS.includes(period)) throw new RangeError('Invalid statistics period');
}

export function todayStatisticsDate(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function statisticsPeriodBounds(anchor: string, period: StatisticsPeriod): StatisticsDateRange {
  checkPeriod(period);
  const start = calendarDate(anchor);
  if (period === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === 'month') start.setUTCDate(1);
  if (period === 'year') start.setUTCMonth(0, 1);
  const end = new Date(start);
  if (period === 'day') end.setUTCDate(end.getUTCDate() + 1);
  if (period === 'week') end.setUTCDate(end.getUTCDate() + 7);
  if (period === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  if (period === 'year') end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  return { start: boundedDateKey(start), end: boundedDateKey(end) };
}

/** Preserve the selected day when possible; clamp Jan 31 / leap day in shorter periods. */
export function shiftStatisticsPeriod(anchor: string, period: StatisticsPeriod, step: number): string {
  checkPeriod(period);
  if (!Number.isSafeInteger(step)) throw new RangeError('Invalid period step');
  const date = calendarDate(anchor);
  if (period === 'day' || period === 'week') date.setUTCDate(date.getUTCDate() + step * (period === 'week' ? 7 : 1));
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    if (period === 'month') date.setUTCMonth(date.getUTCMonth() + step);
    else date.setUTCFullYear(date.getUTCFullYear() + step);
    const last = new Date(date);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    date.setUTCDate(Math.min(day, last.getUTCDate()));
  }
  return dateKey(date);
}

export function statisticsRangeError(range: StatisticsDateRange): 'invalid' | 'reversed' | null {
  if (!isStatisticsDate(range.start) || !isStatisticsDate(range.end)) return 'invalid';
  return range.start > range.end ? 'reversed' : null;
}

export function statisticsPeriodKey(date: string, period: StatisticsPeriod): string {
  return statisticsPeriodBounds(date, period).start;
}

/** Iterate buckets instead of allocating every day in an arbitrarily long custom range. */
export function statisticsPeriodKeys(range: StatisticsDateRange, period: StatisticsPeriod, maximum = 400): { keys: string[]; tooMany: boolean } {
  checkPeriod(period);
  if (statisticsRangeError(range)) return { keys: [], tooMany: false };
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new RangeError('Invalid bucket limit');
  const keys: string[] = [];
  let key = statisticsPeriodKey(range.start, period);
  while (key <= range.end) {
    if (keys.length >= maximum) return { keys: [], tooMany: true };
    keys.push(key);
    const end = statisticsPeriodBounds(key, period).end;
    if (end >= range.end || end === MAX_DATE) break;
    key = shiftStatisticsPeriod(end, 'day', 1);
  }
  return { keys, tooMany: false };
}

export function statisticsRecordDate(value: string): string | null {
  if (isStatisticsDate(value)) return value;
  // Legacy ISO timestamps retain their explicitly recorded calendar date, not the viewer's timezone.
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && isStatisticsDate(day) && Number.isFinite(Date.parse(value)) ? day : null;
}

export function statisticsCurrency(value: string | undefined): string | null {
  const code = value?.trim().toUpperCase();
  return code && /^[A-Z]{3}$/.test(code) ? code : null;
}

export function selectStatisticsRecords(transactions: Transaction[], accounts: Account[], range: StatisticsDateRange, currency: string) {
  const records: Transaction[] = [];
  let unknownCurrencyCount = 0;
  let invalidAmountCount = 0;
  if (statisticsRangeError(range)) return { records, unknownCurrencyCount, invalidAmountCount };
  const accountCurrencies = new Map(accounts.map(account => [account.id, statisticsCurrency(account.currency)]));
  for (const tx of transactions) {
    if (tx.type !== 'expense' && tx.type !== 'income') continue;
    const day = statisticsRecordDate(tx.date);
    if (!day || day < range.start || day > range.end) continue;
    const accountCurrency = accountCurrencies.get(tx.accountId);
    if (!accountCurrency) { unknownCurrencyCount += 1; continue; }
    if (accountCurrency !== currency) continue;
    if (!Number.isFinite(tx.amount)) { invalidAmountCount += 1; continue; }
    records.push(tx);
  }
  return { records, unknownCurrencyCount, invalidAmountCount };
}

// The existing transaction API stores amounts to two decimal places.
export function sumStatisticsAmounts(records: Transaction[]): number {
  return records.reduce((sum, tx) => sum + Math.round(tx.amount * 100), 0) / 100;
}

export function statisticsCategoryRows(records: Transaction[], categories: Category[], type: 'income' | 'expense', primaryId: string, fallbackLabel: string) {
  const available = categories.filter(category => category.type === type && (primaryId ? category.parentId === primaryId : !category.parentId));
  const rows = available.map(category => ({ id: category.id, name: category.name, records: [] as Transaction[] }));
  const byId = new Map(rows.map(row => [row.id, row]));
  const fallback = { id: '__unassigned__', name: fallbackLabel, records: [] as Transaction[] };
  for (const tx of records) {
    if (tx.type !== type || (primaryId && tx.categoryId !== primaryId)) continue;
    const row = byId.get(primaryId ? tx.subcategoryId || '' : tx.categoryId) || fallback;
    row.records.push(tx);
  }
  return [...rows, fallback].map(row => ({ ...row, amount: sumStatisticsAmounts(row.records), count: row.records.length }));
}
