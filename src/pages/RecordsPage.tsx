import React, { useMemo, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useI18n } from '../i18n';
import { format, parseISO } from 'date-fns';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Transaction } from '../types';

export const RecordsPage: React.FC = () => {
  const { transactions, categories, accounts, dispatch } = useAppContext();
  const { t } = useI18n();
  const [dateRange, setDateRange] = useState({
    start: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [editData, setEditData] = useState<Partial<Transaction>>({});

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      const date = parseISO(t.date);
      return date >= parseISO(dateRange.start) && date <= parseISO(dateRange.end);
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [transactions, dateRange]);

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || t('common.none');
  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || t('common.none');
  const getTransactionTime = (tx: Transaction) => {
    const timestamp = tx.createdAt || tx.updatedAt;
    try {
      return format(parseISO(timestamp), 'HH:mm:ss');
    } catch {
      return '--:--:--';
    }
  };

  const editPrimaryCategories = categories.filter(c => !c.parentId && c.type === (editData.type || editing?.type));
  const editSubcategories = categories.filter(c => c.parentId === editData.categoryId);

  const openEdit = (tx: Transaction) => {
    setEditing(tx);
    setEditData(tx);
  };

  const closeEdit = () => {
    setEditing(null);
    setEditData({});
  };

  const handleSave = () => {
    if (!editing) return;
    dispatch({ type: 'UPDATE_TRANSACTION', payload: { id: editing.id, transaction: editData } });
    closeEdit();
  };

  const handleDelete = (id: string) => {
    if (confirm(t('records.deleteConfirm'))) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: id });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('page.records')}</h1>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <Input
          label={t('records.rangeStart')}
          type="date"
          value={dateRange.start}
          onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
        />
        <Input
          label={t('records.rangeEnd')}
          type="date"
          value={dateRange.end}
          onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">{t('records.empty')}</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((tx) => (
              <div key={tx.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-gray-900">
                    {getCategoryName(tx.categoryId)}
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="text-gray-600">{tx.subcategoryId ? getCategoryName(tx.subcategoryId) : t('common.none')}</span>
                    {tx.note && <span className="text-xs text-gray-500 ml-2">- {tx.note}</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {getAccountName(tx.accountId)} • {tx.date} {getTransactionTime(tx)}
                  </div>
                  {tx.receiptId && (
                    <div className="text-[10px] text-gray-400 mt-1">
                      {t('records.receipt')} #{tx.receiptId.slice(0, 6)} {tx.receiptItemIndex !== undefined ? `• ${tx.receiptItemIndex + 1}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${tx.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                    {tx.type === 'income' ? '+' : '-'}{tx.amount.toFixed(2)}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(tx)}>
                    {t('common.edit')}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(tx.id)}>
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={Boolean(editing)} onClose={closeEdit} title={t('records.edit')}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t('accounting.date')}
              type="date"
              value={editData.date || ''}
              onChange={e => setEditData(prev => ({ ...prev, date: e.target.value }))}
            />
            <Input
              label={t('accounting.amount')}
              type="number"
              step="0.01"
              value={editData.amount || ''}
              onChange={e => setEditData(prev => ({ ...prev, amount: parseFloat(e.target.value) }))}
            />
          </div>
          <Select
            label={t('accounting.category')}
            value={editData.categoryId || ''}
            options={[
              { value: '', label: t('accounting.selectCategory') },
              ...editPrimaryCategories.map(c => ({ value: c.id, label: c.name })),
            ]}
            onChange={e => setEditData(prev => ({ ...prev, categoryId: e.target.value, subcategoryId: '' }))}
          />
          <Select
            label={t('accounting.subcategory')}
            value={editData.subcategoryId || ''}
            onChange={e => setEditData(prev => ({ ...prev, subcategoryId: e.target.value }))}
            options={[
              { value: '', label: t('common.none') },
              ...editSubcategories.map(c => ({ value: c.id, label: c.name })),
            ]}
            disabled={!editData.categoryId || editSubcategories.length === 0}
          />
          <Select
            label={t('accounting.account')}
            value={editData.accountId || ''}
            onChange={e => setEditData(prev => ({ ...prev, accountId: e.target.value }))}
            options={[
              { value: '', label: t('accounting.selectAccount') },
              ...accounts.map(a => ({ value: a.id, label: a.name })),
            ]}
          />
          <Input
            label={t('accounting.note')}
            value={editData.note || ''}
            onChange={e => setEditData(prev => ({ ...prev, note: e.target.value }))}
          />
          <Input
            label={t('accounting.project')}
            value={editData.project || ''}
            onChange={e => setEditData(prev => ({ ...prev, project: e.target.value }))}
          />
          <Input
            label={t('accounting.payer')}
            value={editData.payer || ''}
            onChange={e => setEditData(prev => ({ ...prev, payer: e.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeEdit}>{t('common.cancel')}</Button>
            <Button onClick={handleSave}>{t('common.save')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
