import test from 'node:test';
import assert from 'node:assert/strict';
import { totalsByCurrency, balancesByCurrency } from '../src/utils/ledgerPresentation.ts';
import type { Account, Transaction } from '../src/types/index.ts';
const accounts = [{ id: 'cny', currency: 'CNY', balance: 10.1 }, { id: 'usd', currency: 'USD', balance: 20.2 }, { id: 'cash', currency: 'CNY', balance: 0.2 }] as Account[];
const tx = (type: Transaction['type'], amount: number, accountId: string) => ({ type, amount, accountId }) as Transaction;
test('display totals never mix currencies or include transfers', () => {
  assert.deepEqual(totalsByCurrency([tx('income', 0.1, 'cny'), tx('income', 0.2, 'cny'), tx('expense', 5, 'usd'), tx('transfer', 300, 'cny')], accounts), [{ currency: 'CNY', income: 0.3, expense: 0 }, { currency: 'USD', income: 0, expense: 5 }]);
});
test('orphaned transactions are explicit, never assigned to main currency', () => {
  assert.deepEqual(totalsByCurrency([tx('expense', 10, 'missing')], accounts), [{ currency: '—', income: 0, expense: 10 }]);
});
test('account balances are grouped in minor units by currency', () => {
  assert.deepEqual(balancesByCurrency(accounts), [{ currency: 'CNY', balance: 10.3 }, { currency: 'USD', balance: 20.2 }]);
});
test('presentation sums do not mutate accounts or transactions', () => {
  const list = Object.freeze([Object.freeze(tx('expense', 10, 'cny'))]);
  const before = JSON.stringify(accounts); totalsByCurrency(list as unknown as Transaction[], accounts); balancesByCurrency(accounts);
  assert.equal(JSON.stringify(accounts), before);
});
