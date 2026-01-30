import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Account } from '../types';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Plus, Trash2, Edit2, CreditCard } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export const AccountsPage: React.FC = () => {
  const { accounts, dispatch } = useAppContext();
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [formData, setFormData] = useState<Partial<Account>>({
    name: '',
    type: 'cash',
    currency: 'CNY',
    balance: 0,
    isMain: false,
  });

  const accountTypes = [
    { value: 'cash', label: 'Cash' },
    { value: 'bank', label: 'Bank Card' },
    { value: 'wechat', label: 'WeChat' },
    { value: 'alipay', label: 'Alipay' },
    { value: 'securities', label: 'Securities' },
    { value: 'other', label: 'Other' },
  ];

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
    if (confirm('Are you sure you want to delete this account?')) {
      dispatch({ type: 'DELETE_ACCOUNT', payload: id });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <Button onClick={() => { resetForm(); setIsFormOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Account
        </Button>
      </div>

      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>{editingAccount ? 'Edit Account' : 'New Account'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
              
              <Select
                label="Type"
                value={formData.type}
                onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                options={accountTypes}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Currency"
                  value={formData.currency}
                  onChange={e => setFormData({ ...formData, currency: e.target.value.toUpperCase() })}
                />
                <Input
                  label="Balance"
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
                <label htmlFor="isMain" className="text-sm font-medium text-gray-700">Set as Main Account</label>
              </div>

              <div className="flex space-x-2 justify-end">
                <Button type="button" variant="ghost" onClick={resetForm}>Cancel</Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map(account => (
          <div key={account.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm relative overflow-hidden">
             {account.isMain && (
               <div className="absolute top-0 right-0 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-bl-lg font-medium">Main</div>
             )}
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center space-x-3">
                <div className="bg-gray-100 p-2 rounded-full">
                  <CreditCard className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{account.name}</h3>
                  <p className="text-xs text-gray-500 capitalize">{account.type}</p>
                </div>
              </div>
              <div className="flex space-x-1">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(account)}>
                  <Edit2 className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(account.id)}>
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
    </div>
  );
};
