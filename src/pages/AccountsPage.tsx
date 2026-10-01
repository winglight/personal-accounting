import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Account, Transaction } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Plus, Trash2, Edit2, CreditCard, ArrowRightLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '../i18n';

export const AccountsPage: React.FC = () => {
  const { accounts, transactions, dispatch } = useAppContext();
  const { t } = useI18n();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [visibleTransferCount, setVisibleTransferCount] = useState(10);
  const loadMoreTransfersRef = useRef<HTMLDivElement | null>(null);

  const [formData, setFormData] = useState<Partial<Account>>({
    name: '',
    type: 'cash',
    currency: 'CNY',
    balance: 0,
    isMain: false,
  });
  const [transferData, setTransferData] = useState({
    accountId: '',
    targetAccountId: '',
    amount: '',
  });

  const transfers = useMemo(() => transactions
    .filter(transaction => transaction.type === 'transfer')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [transactions]);

  useEffect(() => {
    const target = loadMoreTransfersRef.current;
    if (!target || visibleTransferCount >= transfers.length) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisibleTransferCount(count => Math.min(count + 10, transfers.length));
      }
    }, { rootMargin: '120px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [transfers.length, visibleTransferCount]);

  const accountTypes = [
    { value: 'cash', label: t('accounts.type.cash') },
    { value: 'bank', label: t('accounts.type.bank') },
    { value: 'wechat', label: t('accounts.type.wechat') },
    { value: 'alipay', label: t('accounts.type.alipay') },
    { value: 'securities', label: t('accounts.type.securities') },
    { value: 'other', label: t('accounts.type.other') },
  ];

  const typeLabelMap = new Map(accountTypes.map(t => [t.value, t.label]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    if (editingAccount) {
      dispatch({
        type: 'UPDATE_ACCOUNT',
        payload: { id: editingAccount.id, account: formData },
      });
    } else {
      dispatch({
        type: 'ADD_ACCOUNT',
        payload: {
          id: uuidv4(),
          ...formData,
        } as Account,
      });
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', type: 'cash', currency: 'CNY', balance: 0, isMain: false });
    setEditingAccount(null);
    setIsFormOpen(false);
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormData(account);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(t('accounts.deleteConfirm'))) {
      dispatch({ type: 'DELETE_ACCOUNT', payload: id });
    }
  };

  const openTransfer = (account: Account) => {
    const firstTarget = accounts.find(item => item.id !== account.id);
    setTransferData({
      accountId: account.id,
      targetAccountId: firstTarget?.id || '',
      amount: '',
    });
    setTransferError('');
    setIsTransferOpen(true);
  };

  const handleTransfer = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(transferData.amount);
    if (!transferData.accountId || !transferData.targetAccountId || transferData.accountId === transferData.targetAccountId) {
      setTransferError(t('accounts.transfer.accountError'));
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setTransferError(t('accounts.transfer.amountError'));
      return;
    }

    const now = new Date().toISOString();
    const transfer: Transaction = {
      id: uuidv4(),
      type: 'transfer',
      date: now.slice(0, 10),
      categoryId: '',
      accountId: transferData.accountId,
      targetAccountId: transferData.targetAccountId,
      amount,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'ADD_TRANSACTION', payload: transfer });
    setVisibleTransferCount(count => Math.max(10, count));
    setIsTransferOpen(false);
    setTransferError('');
  };

  const accountName = (id?: string) => accounts.find(account => account.id === id)?.name || t('common.none');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{t('page.accounts')}</h1>
        <Button onClick={() => { resetForm(); setIsFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> {t('accounts.add')}
        </Button>
      </div>

      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{editingAccount ? t('accounts.edit') : t('accounts.new')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label={t('accounts.name')}
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
              
              <Select
                label={t('accounts.type')}
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as Account['type'] })}
                options={accountTypes}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label={t('accounts.currency')}
                  value={formData.currency}
                  onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                />
                <Input
                  label={t('accounts.balance')}
                  type="number"
                  step="0.01"
                  value={formData.balance}
                  onChange={e => setFormData({ ...formData, balance: parseFloat(e.target.value) })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isMain"
                  checked={formData.isMain}
                  onChange={e => setFormData({ ...formData, isMain: e.target.checked })}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-600"
                />
                <label htmlFor="isMain" className="text-sm font-medium text-gray-700">{t('accounts.setMain')}</label>
              </div>

              <div className="flex space-x-2 justify-end">
                <Button type="button" variant="ghost" onClick={resetForm}>{t('common.cancel')}</Button>
                <Button type="submit">{t('common.save')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="pa-account-grid">
        {accounts.map(account => (
          <div key={account.id} className={`pa-account-card ${account.isMain ? 'pa-account-primary' : ''} bg-white rounded-lg border border-gray-200 p-4 shadow-sm relative overflow-hidden`}>
             {account.isMain && (
               <div className="absolute top-0 right-0 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-bl-lg font-medium">{t('accounts.main')}</div>
             )}
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center space-x-3">
                <div className="bg-gray-100 p-2 rounded-full">
                  <CreditCard className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{account.name}</h3>
                  <p className="text-xs text-gray-500 capitalize">{typeLabelMap.get(account.type) || account.type}</p>
                </div>
              </div>
              <div className="flex space-x-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openTransfer(account)}
                  disabled={accounts.length < 2}
                  title={t('accounts.transfer')}
                  aria-label={t('accounts.transfer')}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleEdit(account)} aria-label={`${t('common.edit')} ${account.name}`}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(account.id)} aria-label={`${t('common.delete')} ${account.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-2xl font-bold">{account.currency} {account.balance.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('accounts.transfer.list')}</h2>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          {transfers.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">{t('accounts.transfer.empty')}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {transfers.slice(0, visibleTransferCount).map(transfer => (
                <div key={transfer.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <span className="truncate">{accountName(transfer.accountId)}</span>
                      <ArrowRightLeft className="h-4 w-4 shrink-0 text-gray-400" />
                      <span className="truncate">{accountName(transfer.targetAccountId)}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{transfer.date}</div>
                  </div>
                  <span className="font-semibold whitespace-nowrap text-blue-600">
                    {accounts.find(account => account.id === transfer.accountId)?.currency || ''} {transfer.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {visibleTransferCount < transfers.length && (
                <div ref={loadMoreTransfersRef} className="p-3 text-center text-xs text-gray-400">
                  {t('records.loadingMore')}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <Modal isOpen={isTransferOpen} onClose={() => setIsTransferOpen(false)} title={t('accounts.transfer.new')}>
        <form onSubmit={handleTransfer} className="space-y-4">
          <Select
            label={t('accounts.transfer.from')}
            value={transferData.accountId}
            onChange={event => {
              const accountId = event.target.value;
              const targetAccountId = transferData.targetAccountId === accountId
                ? accounts.find(account => account.id !== accountId)?.id || ''
                : transferData.targetAccountId;
              setTransferData(data => ({ ...data, accountId, targetAccountId }));
              setTransferError('');
            }}
            options={accounts.map(account => ({ value: account.id, label: account.name }))}
          />
          <Select
            label={t('accounts.transfer.to')}
            value={transferData.targetAccountId}
            onChange={event => {
              setTransferData(data => ({ ...data, targetAccountId: event.target.value }));
              setTransferError('');
            }}
            options={accounts
              .filter(account => account.id !== transferData.accountId)
              .map(account => ({ value: account.id, label: account.name }))}
          />
          <Input
            label={t('accounts.transfer.amount')}
            type="number"
            min="0.01"
            step="0.01"
            required
            value={transferData.amount}
            onChange={event => {
              setTransferData(data => ({ ...data, amount: event.target.value }));
              setTransferError('');
            }}
          />
          {transferError && <p className="text-sm text-red-600">{transferError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsTransferOpen(false)}>{t('common.cancel')}</Button>
            <Button type="submit">{t('common.confirm')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
