import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Transaction } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { v4 as uuidv4 } from 'uuid';

export const TransactionForm: React.FC = () => {
  const { categories, accounts, dispatch } = useAppContext();
  const [activeType, setActiveType] = useState<'expense' | 'income'>('expense');
  
  const [formData, setFormData] = useState<Partial<Transaction>>({
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    amount: 0,
    categoryId: '',
    subcategoryId: '',
    accountId: '',
    note: '',
  });

  // Load defaults
  useEffect(() => {
    if (accounts.length > 0 && !formData.accountId) {
      setFormData(prev => ({ ...prev, accountId: accounts[0].id }));
    }
  }, [accounts]);

  const currentCategories = categories.filter(c => c.type === activeType && !c.parentId);
  const subCategories = categories.filter(c => c.parentId === formData.categoryId);

  const selectedAccount = accounts.find(a => a.id === formData.accountId);
  const estimatedBalance = selectedAccount 
    ? selectedAccount.balance + (activeType === 'income' ? formData.amount || 0 : -(formData.amount || 0))
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.categoryId || !formData.accountId) return;

    dispatch({
      type: 'ADD_TRANSACTION',
      payload: {
        id: uuidv4(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: activeType,
        ...formData,
        amount: Number(formData.amount), // Ensure number
      } as Transaction,
    });

    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: activeType,
      amount: 0,
      categoryId: '',
      subcategoryId: '',
      accountId: formData.accountId, // Keep selected account
      note: '',
    });
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="flex space-x-2 mb-4">
        <button
          type="button"
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${activeType === 'expense' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
          onClick={() => { setActiveType('expense'); setFormData(prev => ({ ...prev, type: 'expense', categoryId: '', subcategoryId: '' })); }}
        >
          Expense
        </button>
        <button
          type="button"
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${activeType === 'income' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
          onClick={() => { setActiveType('income'); setFormData(prev => ({ ...prev, type: 'income', categoryId: '', subcategoryId: '' })); }}
        >
          Income
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
            required
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            value={formData.amount || ''}
            onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Category"
            value={formData.categoryId || ''}
            onChange={e => setFormData({ ...formData, categoryId: e.target.value, subcategoryId: '' })}
            options={[
              { value: '', label: 'Select Category' },
              ...currentCategories.map(c => ({ value: c.id, label: c.name }))
            ]}
          />
          <Select
            label="Subcategory"
            value={formData.subcategoryId || ''}
            onChange={e => setFormData({ ...formData, subcategoryId: e.target.value })}
            options={[
              { value: '', label: 'None' },
              ...subCategories.map(c => ({ value: c.id, label: c.name }))
            ]}
            disabled={!formData.categoryId || subCategories.length === 0}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
          <select
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
            value={formData.accountId || ''}
            onChange={e => setFormData({ ...formData, accountId: e.target.value })}
            required
          >
            <option value="">Select Account</option>
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({acc.currency} {acc.balance.toFixed(2)})
              </option>
            ))}
          </select>
          {formData.amount !== undefined && formData.amount > 0 && selectedAccount && (
             <p className="text-xs text-gray-500 mt-1 text-right">
               Balance after: {selectedAccount.currency} {estimatedBalance.toFixed(2)}
             </p>
          )}
        </div>

        <Input
          label="Note"
          value={formData.note || ''}
          onChange={e => setFormData({ ...formData, note: e.target.value })}
        />

        <Button type="submit" className="w-full">
          Save Record
        </Button>
      </form>
    </div>
  );
};
