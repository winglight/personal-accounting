import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { TransactionForm } from '../components/accounting/TransactionForm';
import { TodayRecords } from '../components/accounting/TodayRecords';
import { WeeklyChart } from '../components/accounting/WeeklyChart';
import { AIChat } from '../components/accounting/AIChat';

export const AccountingPage: React.FC = () => {
  const { settings } = useAppContext();

  if (settings.aiAccounting && settings.geminiToken) {
    return <AIChat />;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Form and Chart */}
      <div className="lg:col-span-7 space-y-6">
        <TransactionForm />
        <WeeklyChart />
      </div>
      
      {/* Right Column: List */}
      <div className="lg:col-span-5">
        <TodayRecords />
      </div>
    </div>
  );
};
