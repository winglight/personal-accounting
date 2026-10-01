import type { Account, Transaction } from '../types/index.ts';

/** Display-only sums: no conversion, balance mutation, or guessed currency. */
export function totalsByCurrency(transactions: Transaction[], accounts: Account[]) {
  const currencies = new Map(accounts.map(account => [account.id, account.currency]));
  const totals = new Map<string, { currency: string; income: number; expense: number }>();
  for (const transaction of transactions) {
    if (transaction.type === 'transfer') continue;
    const currency = currencies.get(transaction.accountId) || '—';
    const row = totals.get(currency) || { currency, income: 0, expense: 0 };
    // Match the server's two-decimal minor-unit contract for display sums.
    row[transaction.type] += Math.round(transaction.amount * 100);
    totals.set(currency, row);
  }
  return [...totals.values()].map(row => ({ ...row, income: row.income / 100, expense: row.expense / 100 }));
}

export function balancesByCurrency(accounts: Account[]) {
  const totals = new Map<string, number>();
  for (const account of accounts) totals.set(account.currency, (totals.get(account.currency) || 0) + Math.round(account.balance * 100));
  return [...totals].map(([currency, balance]) => ({ currency, balance: balance / 100 }));
}
