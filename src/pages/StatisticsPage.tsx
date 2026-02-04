import React, { useState, useMemo } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useI18n } from '../i18n';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

export const StatisticsPage: React.FC = () => {
  const { transactions } = useAppContext();
  const { t, language } = useI18n();
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });

  const [visibleSeries, setVisibleSeries] = useState({
    income: true,
    expense: true,
  });

  const days = useMemo(() => {
    try {
      return eachDayOfInterval({
        start: parseISO(dateRange.start),
        end: parseISO(dateRange.end),
      });
    } catch {
      return [];
    }
  }, [dateRange]);

  const chartData = useMemo(() => {
    const locale = language === 'zh' ? zhCN : enUS;
    const labels = days.map(d => format(d, 'MMM dd', { locale }));
    
    const incomeData = days.map(day => 
      transactions
        .filter(t => isSameDay(parseISO(t.date), day) && t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0)
    );

    const expenseData = days.map(day => 
      transactions
        .filter(t => isSameDay(parseISO(t.date), day) && t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0)
    );

    return {
      labels,
      datasets: [
        {
          label: t('accounting.income'),
          data: incomeData,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.5)',
          hidden: !visibleSeries.income,
          tension: 0.3,
        },
        {
          label: t('accounting.expense'),
          data: expenseData,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.5)',
          hidden: !visibleSeries.expense,
          tension: 0.3,
        },
      ],
    };
  }, [days, transactions, visibleSeries, t, language]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('page.statistics')}</h1>
      
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('statistics.startDate')}</label>
          <input 
            type="date" 
            className="border rounded-md px-2 py-1 text-sm"
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('statistics.endDate')}</label>
          <input 
            type="date" 
            className="border rounded-md px-2 py-1 text-sm"
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          />
        </div>
        <div className="flex gap-4 ml-auto items-center">
             <label className="flex items-center space-x-1 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={visibleSeries.income} onChange={e => setVisibleSeries(p => ({ ...p, income: e.target.checked }))} className="rounded text-green-600 focus:ring-green-600" />
                <span>{t('accounting.income')}</span>
             </label>
             <label className="flex items-center space-x-1 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={visibleSeries.expense} onChange={e => setVisibleSeries(p => ({ ...p, expense: e.target.checked }))} className="rounded text-red-600 focus:ring-red-600" />
                <span>{t('accounting.expense')}</span>
             </label>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-96">
        <Line 
            data={chartData} 
            options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: '#f3f4f6',
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }} 
        />
      </div>
    </div>
  );
};
