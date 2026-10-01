import test from 'node:test';
import assert from 'node:assert/strict';
import type { Account, Category, Transaction } from '../src/types/index.ts';
import {
  isStatisticsDate, selectStatisticsRecords, shiftStatisticsPeriod, statisticsCategoryRows,
  statisticsCurrency, statisticsPeriodBounds, statisticsPeriodKey, statisticsPeriodKeys,
  statisticsRangeError, statisticsRecordDate, sumStatisticsAmounts, todayStatisticsDate,
} from '../src/utils/statisticsPeriod.ts';

const account = (id: string, currency: string) => ({ id, currency } as Account);
const record = (values: Partial<Transaction> = {}) => ({ id: 't', date: '2026-10-01', type: 'expense', categoryId: 'food', amount: 12.34, accountId: 'cny', createdAt: '', updatedAt: '', ...values } as Transaction);
const range = { start: '2026-10-01', end: '2026-10-31' };

test('calendar bounds cover leap day, Monday weeks and cross-year weeks', () => {
  assert.deepEqual(statisticsPeriodBounds('2024-02-29', 'month'), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(statisticsPeriodBounds('2026-01-01', 'week'), { start: '2025-12-29', end: '2026-01-04' });
  assert.deepEqual(statisticsPeriodBounds('2026-10-04', 'week'), { start: '2026-09-28', end: '2026-10-04' });
  assert.deepEqual(statisticsPeriodBounds('2026-10-01', 'year'), { start: '2026-01-01', end: '2026-12-31' });
});

test('paging clamps month ends and leap years and preserves calendar days at DST changes', () => {
  assert.equal(shiftStatisticsPeriod('2024-01-31', 'month', 1), '2024-02-29');
  assert.equal(shiftStatisticsPeriod('2024-02-29', 'year', 1), '2025-02-28');
  assert.equal(shiftStatisticsPeriod('2026-12-31', 'day', 1), '2027-01-01');
  assert.equal(shiftStatisticsPeriod('2026-03-08', 'day', 1), '2026-03-09');
  assert.equal(shiftStatisticsPeriod('2026-11-01', 'day', -1), '2026-10-31');
  assert.equal(shiftStatisticsPeriod('2026-01-01', 'week', -1), '2025-12-25');
});

test('every scope pages to the immediately adjacent non-overlapping period', () => {
  for (const date of ['2023-01-31', '2024-02-29', '2026-01-01', '2026-03-08', '2026-11-01', '2026-12-31']) {
    for (const scope of ['day', 'week', 'month', 'year'] as const) {
      const current = statisticsPeriodBounds(date, scope);
      const next = statisticsPeriodBounds(shiftStatisticsPeriod(date, scope, 1), scope);
      const previous = statisticsPeriodBounds(shiftStatisticsPeriod(date, scope, -1), scope);
      assert.equal(shiftStatisticsPeriod(current.end, 'day', 1), next.start);
      assert.equal(shiftStatisticsPeriod(previous.end, 'day', 1), current.start);
    }
  }
});

test('invalid/reversed/empty dates are rejected and supported calendar edges do not wrap', () => {
  for (const date of ['', '2026-2-01', '2026-02-29', '2026-04-31', '0000-01-01', '10000-01-01']) assert.equal(isStatisticsDate(date), false);
  assert.equal(statisticsRangeError({ start: '', end: '2026-10-01' }), 'invalid');
  assert.equal(statisticsRangeError({ start: '2026-10-02', end: '2026-10-01' }), 'reversed');
  assert.throws(() => shiftStatisticsPeriod('9999-12-31', 'day', 1), RangeError);
  assert.throws(() => shiftStatisticsPeriod('0001-01-01', 'day', -1), RangeError);
  assert.throws(() => shiftStatisticsPeriod('2026-10-01', 'month', 1.5), RangeError);
  assert.deepEqual(statisticsPeriodBounds('9999-12-31', 'week'), { start: '9999-12-27', end: '9999-12-31' });
  assert.equal(statisticsPeriodBounds('0001-01-01', 'year').start, '0001-01-01');
});

test('today follows the local calendar and timestamp records retain their recorded date', () => {
  assert.equal(todayStatisticsDate(new Date(2026, 9, 1, 23, 59)), '2026-10-01');
  assert.equal(statisticsRecordDate('2026-10-01T00:30:00+08:00'), '2026-10-01');
  assert.equal(statisticsRecordDate('2026-02-30T12:00:00Z'), null);
  assert.equal(statisticsRecordDate('2026-10-01broken'), null);
});

test('aggregation fills missing periods without changing the selected range', () => {
  assert.equal(statisticsPeriodKeys(range, 'day').keys.length, 31);
  assert.deepEqual(statisticsPeriodKeys(range, 'month').keys, ['2026-10-01']);
  assert.deepEqual(statisticsPeriodKeys({ start: '2025-12-31', end: '2026-01-05' }, 'week').keys, ['2025-12-29', '2026-01-05']);
  assert.equal(statisticsPeriodKey('2026-10-01', 'year'), '2026-01-01');
  assert.equal(statisticsPeriodKeys({ start: '2024-01-01', end: '2024-12-31' }, 'day').keys.length, 366);
  assert.deepEqual(statisticsPeriodKeys({ start: '', end: '' }, 'day'), { keys: [], tooMany: false });
});

test('long ranges refuse excessive chart buckets without generating partial charts', () => {
  assert.deepEqual(statisticsPeriodKeys({ start: '0001-01-01', end: '9999-12-31' }, 'day'), { keys: [], tooMany: true });
  assert.deepEqual(statisticsPeriodKeys({ start: '0001-01-01', end: '9999-12-31' }, 'year'), { keys: [], tooMany: true });
  assert.deepEqual(statisticsPeriodKeys({ start: '9999-12-30', end: '9999-12-31' }, 'day').keys, ['9999-12-30', '9999-12-31']);
});

test('one shared inclusive currency/date selection excludes all transfers', () => {
  const accounts = [account('cny', 'CNY'), account('usd', 'USD')];
  const transactions = [record(), record({ id: 'end', date: '2026-10-31' }), record({ date: '2026-09-30' }), record({ date: '2026-11-01' }), record({ accountId: 'usd' }), record({ type: 'transfer', targetAccountId: 'usd', amount: 9999 })];
  const selected = selectStatisticsRecords(transactions, accounts, range, 'CNY');
  assert.equal(selected.records.length, 2);
  assert.equal(sumStatisticsAmounts(selected.records), 24.68);
  assert.equal(selectStatisticsRecords(transactions, accounts, range, 'USD').records.length, 1);
  assert.equal(selectStatisticsRecords([record({ type: 'transfer' })], accounts, range, 'CNY').records.length, 0);
});

test('unknown accounts and blank/invalid currencies never fall back to the selected currency', () => {
  const accounts = [account('cny', ' cny '), account('blank', ''), account('invalid', '人民币')];
  const result = selectStatisticsRecords([record(), record({ accountId: 'deleted' }), record({ accountId: 'blank' }), record({ accountId: 'invalid' })], accounts, range, 'CNY');
  assert.equal(result.records.length, 1);
  assert.equal(result.unknownCurrencyCount, 3);
  assert.equal(statisticsCurrency(undefined), null);
  assert.equal(statisticsCurrency('usd'), 'USD');
  assert.equal(selectStatisticsRecords([record({ date: '2026-11-01', accountId: 'deleted' })], accounts, range, 'CNY').unknownCurrencyCount, 0);
});

test('invalid amounts and invalid date ranges do not produce misleading sums', () => {
  const result = selectStatisticsRecords([record({ amount: Number.NaN }), record({ amount: Infinity }), record()], [account('cny', 'CNY')], range, 'CNY');
  assert.equal(result.invalidAmountCount, 2);
  assert.equal(result.records.length, 1);
  assert.equal(selectStatisticsRecords([record()], [account('cny', 'CNY')], { start: '', end: '' }, 'CNY').records.length, 0);
  assert.equal(sumStatisticsAmounts([record({ amount: 0.1 }), record({ amount: 0.2 })]), 0.3);
});

const categories = [
  { id: 'food', name: 'Food', type: 'expense', sortOrder: 0 },
  { id: 'lunch', name: 'Lunch', type: 'expense', parentId: 'food', sortOrder: 0 },
  { id: 'travel', name: 'Travel', type: 'expense', sortOrder: 1 },
  { id: 'salary', name: 'Salary', type: 'income', sortOrder: 0 },
] as Category[];

test('category totals include deleted/missing categories, preserving summary totals', () => {
  const records = [record({ amount: 10 }), record({ categoryId: 'deleted', amount: 5 }), record({ categoryId: '', amount: 3 }), record({ type: 'income', categoryId: 'salary', amount: 100 }), record({ type: 'transfer', amount: 1000 })];
  const rows = statisticsCategoryRows(records, categories, 'expense', '', 'Unknown');
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 18);
  assert.equal(rows.find(row => row.name === 'Unknown')?.count, 2);
  assert.equal(statisticsCategoryRows(records, categories, 'income', '', 'Unknown').find(row => row.id === 'salary')?.amount, 100);
});

test('secondary-category analysis is restricted to its parent and retains unassigned children', () => {
  const records = [record({ subcategoryId: 'lunch', amount: 10 }), record({ amount: 5 }), record({ subcategoryId: 'deleted', amount: 3 }), record({ categoryId: 'travel', subcategoryId: 'lunch', amount: 99 })];
  const rows = statisticsCategoryRows(records, categories, 'expense', 'food', 'Unassigned');
  assert.equal(rows.find(row => row.id === 'lunch')?.amount, 10);
  assert.equal(rows.find(row => row.name === 'Unassigned')?.amount, 8);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 18);
});
