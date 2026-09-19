import React, { useMemo, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { eachDayOfInterval, endOfMonth, format, isSameDay, parseISO, startOfMonth } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useI18n } from '../i18n';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#64748b',
];

export const StatisticsPage: React.FC = () => {
  const { transactions, categories } = useAppContext();
  const { t, language } = useI18n();
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });
  const [visibleSeries, setVisibleSeries] = useState({ income: true, expense: true });
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [primaryCategoryId, setPrimaryCategoryId] = useState('');

  const days = useMemo(() => {
    try {
      return eachDayOfInterval({ start: parseISO(dateRange.start), end: parseISO(dateRange.end) });
    } catch {
      return [];
    }
  }, [dateRange]);

  const labels = useMemo(() => {
    const locale = language === 'zh' ? zhCN : enUS;
    return days.map(day => format(day, 'MMM dd', { locale }));
  }, [days, language]);

  const trendData = useMemo(() => ({
    labels,
    datasets: [
      {
        label: t('accounting.income'),
        data: days.map(day => transactions.filter(tx => tx.type === 'income' && isSameDay(parseISO(tx.date), day)).reduce((sum, tx) => sum + tx.amount, 0)),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
        hidden: !visibleSeries.income,
        tension: 0.3,
      },
      {
        label: t('accounting.expense'),
        data: days.map(day => transactions.filter(tx => tx.type === 'expense' && isSameDay(parseISO(tx.date), day)).reduce((sum, tx) => sum + tx.amount, 0)),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.5)',
        hidden: !visibleSeries.expense,
        tension: 0.3,
      },
    ],
  }), [days, labels, transactions, visibleSeries, t]);

  const primaryCategories = useMemo(
    () => categories.filter(category => category.type === categoryType && !category.parentId),
    [categories, categoryType],
  );

  const categorySeries = useMemo(() => {
    if (!primaryCategoryId) return primaryCategories;
    return categories.filter(category => category.parentId === primaryCategoryId);
  }, [categories, primaryCategories, primaryCategoryId]);

  const categoryData = useMemo(() => {
    const datasets = categorySeries.map((category, index) => ({
      label: category.name,
      data: days.map(day => transactions
        .filter(tx => tx.type === categoryType
          && isSameDay(parseISO(tx.date), day)
          && (primaryCategoryId ? tx.subcategoryId === category.id : tx.categoryId === category.id))
        .reduce((sum, tx) => sum + tx.amount, 0)),
      backgroundColor: COLORS[index % COLORS.length],
      borderRadius: 3,
    }));

    if (primaryCategoryId) {
      datasets.push({
        label: t('statistics.uncategorized'),
        data: days.map(day => transactions
          .filter(tx => tx.type === categoryType
            && tx.categoryId === primaryCategoryId
            && !tx.subcategoryId
            && isSameDay(parseISO(tx.date), day))
          .reduce((sum, tx) => sum + tx.amount, 0)),
        backgroundColor: COLORS[(categorySeries.length) % COLORS.length],
        borderRadius: 3,
      });
    }

    return { labels, datasets };
  }, [categorySeries, categoryType, days, labels, primaryCategoryId, t, transactions]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f3f4f6' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('page.statistics')}</h1>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('statistics.startDate')}</label>
          <input type="date" className="border rounded-md px-2 py-1 text-sm" value={dateRange.start} onChange={event => setDateRange(previous => ({ ...previous, start: event.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">{t('statistics.endDate')}</label>
          <input type="date" className="border rounded-md px-2 py-1 text-sm" value={dateRange.end} onChange={event => setDateRange(previous => ({ ...previous, end: event.target.value }))} />
        </div>
        <div className="flex gap-4 ml-auto items-center">
          <label className="flex items-center space-x-1 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={visibleSeries.income} onChange={event => setVisibleSeries(previous => ({ ...previous, income: event.target.checked }))} className="rounded text-green-600 focus:ring-green-600" />
            <span>{t('accounting.income')}</span>
          </label>
          <label className="flex items-center space-x-1 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={visibleSeries.expense} onChange={event => setVisibleSeries(previous => ({ ...previous, expense: event.target.checked }))} className="rounded text-red-600 focus:ring-red-600" />
            <span>{t('accounting.expense')}</span>
          </label>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-96">
        <Line data={trendData} options={chartOptions} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('accounting.type')}</label>
            <select
              className="border rounded-md px-3 py-2 text-sm"
              value={categoryType}
              onChange={event => {
                setCategoryType(event.target.value as 'expense' | 'income');
                setPrimaryCategoryId('');
              }}
            >
              <option value="expense">{t('accounting.expense')}</option>
              <option value="income">{t('accounting.income')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">{t('statistics.categoryLevel')}</label>
            <select className="border rounded-md px-3 py-2 text-sm min-w-48" value={primaryCategoryId} onChange={event => setPrimaryCategoryId(event.target.value)}>
              <option value="">{t('statistics.allPrimary')}</option>
              {primaryCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </div>
          <div className="text-sm font-medium text-gray-700">
            {primaryCategoryId ? t('statistics.secondaryBreakdown') : t('statistics.primaryBreakdown')}
          </div>
        </div>
        <div className="h-96">
          <Bar data={categoryData} options={{ ...chartOptions, scales: { x: { stacked: false, grid: { display: false } }, y: { beginAtZero: true, stacked: false, grid: { color: '#f3f4f6' } } } }} />
        </div>
      </div>
    </div>
  );
};
