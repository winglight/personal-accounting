import { useEffect, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { startOfWeek, endOfWeek, eachDayOfInterval, format, isSameDay, parseISO } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';
import { useI18n } from '../../i18n';
import { useTheme } from '../../hooks/useTheme';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
export function WeeklyChart() {
  const { transactions, accounts, settings } = useAppContext();
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const [currency, setCurrency] = useState(settings.mainCurrency);
  const currencies = [...new Set([settings.mainCurrency, ...accounts.map(account => account.currency)])];
  const [colors, setColors] = useState({ income: '#267052', expense: '#a04a30', text: '#5a6c5e', grid: '#ccd9c8' });
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setColors({ income: style.getPropertyValue('--income').trim() || '#267052', expense: style.getPropertyValue('--expense').trim() || '#a04a30', text: style.getPropertyValue('--muted').trim() || '#5a6c5e', grid: style.getPropertyValue('--chart-grid').trim() || '#ccd9c8' });
  }, [theme]);
  const days = eachDayOfInterval({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfWeek(new Date(), { weekStartsOn: 1 }) });
  const selected = transactions.filter(tx => accounts.find(account => account.id === tx.accountId)?.currency === currency && tx.type !== 'transfer');
  const sum = (day: Date, type: 'income' | 'expense') => selected.filter(tx => isSameDay(parseISO(tx.date), day) && tx.type === type).reduce((total, tx) => total + Math.round(tx.amount * 100), 0) / 100;
  const data = { labels: days.map(day => format(day, 'EEE', { locale: language === 'zh' ? zhCN : enUS })), datasets: [
    { label: t('accounting.income'), data: days.map(day => sum(day, 'income')), backgroundColor: colors.income, borderRadius: 4 },
    { label: t('accounting.expense'), data: days.map(day => sum(day, 'expense')), backgroundColor: colors.expense, borderRadius: 4 },
  ] };
  return <section className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm">
    <div className="flex items-center justify-between gap-3 mb-5"><h2 className="text-sm font-semibold">{t('statistics.weekly')}</h2><label className="text-xs text-gray-500">{language === 'zh' ? '币种' : 'Currency'} <select className="border rounded-md p-1 bg-white" value={currency} onChange={e => setCurrency(e.target.value)}>{currencies.map(value => <option key={value}>{value}</option>)}</select></label></div>
    <div className="h-48"><Bar data={data} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { color: colors.text, boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { color: colors.text }, grid: { color: colors.grid } }, x: { grid: { display: false }, ticks: { color: colors.text } } } }} role="img" aria-label={`${t('statistics.weekly')} ${currency}`} /></div>
    <details className="text-xs text-gray-500 mt-4"><summary>{language === 'zh' ? '查看图表数据 · 转账不计收支' : 'Chart data · transfers excluded'}</summary><table className="w-full mt-2"><thead><tr><th>{t('accounting.date')}</th><th>{t('accounting.income')} ({currency})</th><th>{t('accounting.expense')} ({currency})</th></tr></thead><tbody>{days.map(day => <tr key={day.toISOString()}><td>{format(day, 'MM-dd')}</td><td className="text-right">{sum(day, 'income').toFixed(2)}</td><td className="text-right">{sum(day, 'expense').toFixed(2)}</td></tr>)}</tbody></table></details>
  </section>;
}
