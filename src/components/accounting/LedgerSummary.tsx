import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { useAppContext } from '../../contexts/AppContext';
import { useI18n } from '../../i18n';
import { balancesByCurrency, totalsByCurrency } from '../../utils/ledgerPresentation';

export function LedgerSummary() {
  const { transactions, accounts } = useAppContext();
  const { language } = useI18n();
  const today = format(new Date(), 'yyyy-MM-dd');
  const start = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const totals = totalsByCurrency(transactions.filter(tx => tx.date >= start && tx.date <= today), accounts);
  const balances = balancesByCurrency(accounts);
  return <section className="pa-summary" aria-label={language === 'zh' ? '账本概览' : 'Ledger overview'}>
    <div><p><ArrowUpRight size={15} />{language === 'zh' ? '本月支出' : 'Month-to-date expenses'}</p>{totals.length ? totals.map(row => <strong key={row.currency} className="pa-expense"><small>{row.currency}</small>{row.expense.toFixed(2)}</strong>) : <strong>—</strong>}<span>{language === 'zh' ? '不含账户间转账' : 'Transfers excluded'}</span></div>
    <div><p><ArrowDownLeft size={15} />{language === 'zh' ? '本月收入' : 'Month-to-date income'}</p>{totals.length ? totals.map(row => <strong key={row.currency} className="pa-income"><small>{row.currency}</small>{row.income.toFixed(2)}</strong>) : <strong>—</strong>}<span>{start} – {today}</span></div>
    <div><p><Wallet size={15} />{language === 'zh' ? '账户余额' : 'Account balances'}</p>{balances.length ? balances.map(row => <strong key={row.currency}><small>{row.currency}</small>{row.balance.toFixed(2)}</strong>) : <strong>—</strong>}<span>{language === 'zh' ? '按币种分别显示，不自动折算' : 'Separate currencies, no conversion'}</span></div>
  </section>;
}
