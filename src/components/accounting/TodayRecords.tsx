import { useAppContext } from '../../contexts/AppContext';
import { format, isSameDay, parseISO } from 'date-fns';
import { ArrowRightLeft, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { totalsByCurrency } from '../../utils/ledgerPresentation';

export function TodayRecords() {
  const { transactions, categories, accounts, dispatch } = useAppContext();
  const { t, language } = useI18n();
  const todayTransactions = transactions.filter(tx => isSameDay(parseISO(tx.date), new Date())).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const totals = totalsByCurrency(todayTransactions, accounts);
  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || t('common.none');
  const getAccountName = (id?: string) => accounts.find(a => a.id === id)?.name || t('common.none');
  const handleDelete = (id: string) => { if (confirm(t('today.deleteConfirm'))) dispatch({ type: 'DELETE_TRANSACTION', payload: id }); };
  return (
    <section className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="pa-today-head border-b border-gray-100 flex justify-between items-center">
        <h2 className="font-semibold">{t('today.title')}<small className="ml-2 font-normal text-gray-500">{todayTransactions.length}</small></h2>
        <div className="text-xs space-y-1">{totals.map(row => <div key={row.currency}><span className="text-gray-500 mr-2">{row.currency}</span><span className="pa-income mr-3">{t('today.in')}: +{row.income.toFixed(2)}</span><span className="pa-expense">{t('today.out')}: -{row.expense.toFixed(2)}</span></div>)}</div>
      </div>
      <div className="divide-y divide-gray-100 overflow-y-auto max-h-[500px]">
        {todayTransactions.length === 0 ? <div className="p-8 text-center text-gray-400 text-sm">{t('today.empty')}</div> : todayTransactions.map(tx => (
          <div key={tx.id} className="pa-today-row flex justify-between items-center hover:bg-gray-50">
            <div className="min-w-0 flex-1">
              <div className="pa-record-title font-medium">{tx.type === 'transfer' ? <span className="inline-flex items-center gap-1"><ArrowRightLeft size={14} />{t('accounts.transfer')}</span> : <>{getCategoryName(tx.categoryId)}{tx.subcategoryId && <span className="text-gray-500"> / {getCategoryName(tx.subcategoryId)}</span>}</>}</div>
              {tx.note && <div className="pa-record-meta truncate" title={tx.note}>{tx.note}</div>}
              <div className="pa-record-meta">{getAccountName(tx.accountId)}{tx.type === 'transfer' && ` → ${getAccountName(tx.targetAccountId)}`} · {format(parseISO(tx.createdAt), 'HH:mm')}</div>
            </div>
            <div className="pa-record-actions flex items-center gap-2">
              <span className={`pa-record-amount pa-${tx.type}`}><small>{accounts.find(a => a.id === tx.accountId)?.currency || '—'} </small>{tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{tx.amount.toFixed(2)}</span>
              <button type="button" onClick={() => handleDelete(tx.id)} className="pa-record-delete" aria-label={`${language === 'zh' ? '删除' : 'Delete'} ${tx.note || getCategoryName(tx.categoryId)}`}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
