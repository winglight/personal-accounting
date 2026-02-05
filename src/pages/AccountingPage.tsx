import React, { useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { TransactionForm } from '../components/accounting/TransactionForm';
import { TodayRecords } from '../components/accounting/TodayRecords';
import { WeeklyChart } from '../components/accounting/WeeklyChart';
import { AIChat } from '../components/accounting/AIChat';
import { useI18n } from '../i18n';

export const AccountingPage: React.FC = () => {
  const { settings } = useAppContext();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'stats' | 'chat'>('stats');
  const aiReady = Boolean(settings.aiConfig?.enabled && settings.aiConfig?.token && settings.aiConfig?.baseUrl);

  if (aiReady) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2 rounded-lg border border-gray-200 bg-white p-2">
          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'stats'
                ? 'bg-green-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t('accounting.tab.stats')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-green-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t('accounting.tab.chat')}
          </button>
        </div>

        <div className={activeTab === 'chat' ? 'block' : 'hidden'}>
          <AIChat />
        </div>

        <div className={activeTab === 'stats' ? 'block' : 'hidden'}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <TransactionForm />
              <WeeklyChart />
            </div>
            <div className="lg:col-span-5">
              <TodayRecords />
            </div>
          </div>
        </div>
      </div>
    );
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
