import React from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { format, isSameDay, parseISO } from 'date-fns';
import { Trash2 } from 'lucide-react';

export const TodayRecords: React.FC = () => {
  const { transactions, categories, accounts, dispatch } = useAppContext();
  const today = new Date();
  
  const todayTransactions = transactions.filter(t => 
    isSameDay(parseISO(t.date), today)
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const income = todayTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
    
  const expense = todayTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const handleDelete = (id: string) => {
    if (confirm('Delete this record?')) {
      dispatch({ type: 'DELETE_TRANSACTION', payload: id });
    }
  };

  const getCategoryName = (id: string) => categories.find(c => c.id === id)?.name || 'Unknown';
  const getAccountName = (id: string) => accounts.find(a => a.id === id)?.name || 'Unknown';

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden h-full">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-700">Today</h3>
        <div className="text-sm space-x-3">
          <span className="text-green-600">In: +{income.toFixed(2)}</span>
          <span className="text-red-600">Out: -{expense.toFixed(2)}</span>
        </div>
      </div>
      
      <div className="divide-y divide-gray-100 overflow-y-auto max-h-[500px]">
        {todayTransactions.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No records today</div>
        ) : (
          todayTransactions.map(t => (
            <div key={t.id} className="p-4 flex justify-between items-center hover:bg-gray-50 group">
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">{getCategoryName(t.categoryId)}</span>
                  {t.note && <span className="text-xs text-gray-500 truncate max-w-[150px]">- {t.note}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {getAccountName(t.accountId)} • {format(parseISO(t.createdAt), 'HH:mm')}
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <span className={`font-semibold ${t.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === 'income' ? '+' : '-'}{t.amount.toFixed(2)}
                </span>
                <button 
                  onClick={() => handleDelete(t.id)}
                  className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
