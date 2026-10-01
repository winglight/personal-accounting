import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Wallet, BarChart3 } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import type { TooltipItem } from 'chart.js';
import { useI18n } from '../i18n';
import { useTheme } from '../hooks/useTheme';
import {
  isStatisticsDate, selectStatisticsRecords, shiftStatisticsPeriod, statisticsCategoryRows,
  statisticsCurrency, statisticsPeriodBounds, statisticsPeriodKey, statisticsPeriodKeys,
  statisticsRangeError, statisticsRecordDate, sumStatisticsAmounts, todayStatisticsDate,
} from '../utils/statisticsPeriod';
import type { StatisticsDateRange, StatisticsPeriod } from '../utils/statisticsPeriod';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);
const SCOPES: StatisticsPeriod[] = ['day', 'week', 'month', 'year'];
const FALLBACK_PALETTE = { income: '#438f75', expense: '#c98368', ink: '#243e35', muted: '#75877f', grid: '#e7eee9', categories: ['#c98368', '#9a87b2', '#719cbd', '#438f75', '#ca8ea6', '#84938a', '#39785f', '#708b78'] };
const TEXT = {
  zh: {
    title: '统计分析', subtitle: '看看钱花在哪里，又从哪里来', browse: '浏览范围', custom: '自定义', current: { day: '今天', week: '本周', month: '本月', year: '本年' },
    previous: '上一', next: '下一', aggregation: '趋势聚合粒度', balance: '结余', records: '笔收支记录', noTransfers: '收入 − 支出 · 不含转账',
    trend: '收支趋势', category: '分类金额', categoryOverTime: '分类随时间变化', currency: '统计币种', currencyNote: '按账户原币种统计，不进行汇率换算',
    noData: '本期暂无记录', emptyHint: '可切换币种、日期范围或分类查看更多记录', rangeInvalid: '请选择有效的开始和结束日期', rangeReversed: '结束日期不能早于开始日期',
    tooMany: '该范围在当前粒度下超过 400 个时间段，请选择周、月、年聚合或缩短日期范围；上方总额与分类金额仍覆盖完整范围',
    unknown: '笔记录的账户或币种缺失，已从币种汇总中排除', invalidAmount: '笔记录金额无效，已从统计中排除',
    unassigned: '未分类 / 分类已删除', secondaryUnassigned: '未细分 / 子分类已删除', ranked: '按金额从高到低排列', allCategories: '全部分类',
    customHint: '自定义日期时暂停前后翻页；选择日、周、月、年可恢复', share: '占比', count: '笔', range: '统计日期范围',
  },
  en: {
    title: 'Statistics', subtitle: 'A clearer view of where your money comes and goes', browse: 'Browse range', custom: 'Custom', current: { day: 'Today', week: 'This week', month: 'This month', year: 'This year' },
    previous: 'Previous ', next: 'Next ', aggregation: 'Trend grouping', balance: 'Net income', records: 'income / expense records', noTransfers: 'Income − expenses · transfers excluded',
    trend: 'Income and expenses', category: 'Category totals', categoryOverTime: 'Categories over time', currency: 'Currency', currencyNote: 'Original account currencies; no exchange-rate conversion',
    noData: 'No records in this range', emptyHint: 'Try another currency, date range, or category', rangeInvalid: 'Choose valid start and end dates', rangeReversed: 'The end date must be on or after the start date',
    tooMany: 'This range contains over 400 time buckets. Group by week, month, or year, or shorten the range. Summary and category totals still cover the complete range.',
    unknown: 'records have a missing account or currency and are excluded from currency totals', invalidAmount: 'records have invalid amounts and are excluded',
    unassigned: 'Unassigned / deleted category', secondaryUnassigned: 'Unassigned / deleted subcategory', ranked: 'Sorted by amount', allCategories: 'All categories',
    customHint: 'Paging is paused for custom dates. Choose day, week, month, or year to resume.', share: 'Share', count: 'records', range: 'Statistics date range',
  },
};

export const StatisticsPage: React.FC = () => {
  const { transactions, categories, accounts, settings } = useAppContext();
  const { t, language } = useI18n();
  const { theme } = useTheme();
  const text = TEXT[language];
  const locale = language === 'zh' ? 'zh-CN' : 'en-US';
  const [anchor, setAnchor] = useState(todayStatisticsDate);
  const [rangeScope, setRangeScope] = useState<StatisticsPeriod>('month');
  const [custom, setCustom] = useState(false);
  const [customRange, setCustomRange] = useState<StatisticsDateRange>(() => statisticsPeriodBounds(todayStatisticsDate(), 'month'));
  const [visibleSeries, setVisibleSeries] = useState({ income: true, expense: true });
  // Browsing the range never changes the independently selected aggregation granularity.
  const [period, setPeriod] = useState<StatisticsPeriod>('day');
  const [categoryType, setCategoryType] = useState<'expense' | 'income'>('expense');
  const [primaryCategoryId, setPrimaryCategoryId] = useState('');
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);
  const [palette, setPalette] = useState(FALLBACK_PALETTE);

  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const color = (token: string, fallback: string) => style.getPropertyValue(token).trim() || fallback;
    setPalette({
      income: color('--income', FALLBACK_PALETTE.income), expense: color('--expense', FALLBACK_PALETTE.expense),
      ink: color('--ink', FALLBACK_PALETTE.ink), muted: color('--muted', FALLBACK_PALETTE.muted), grid: color('--chart-grid', FALLBACK_PALETTE.grid),
      categories: ['food', 'shop', 'travel', 'home', 'fun', 'other', 'salary', 'side'].map((name, i) => color(`--chart-${name}`, FALLBACK_PALETTE.categories[i])),
    });
  }, [theme]);

  const dateRange = useMemo(() => custom ? customRange : statisticsPeriodBounds(anchor, rangeScope), [custom, customRange, anchor, rangeScope]);
  const rangeError = statisticsRangeError(dateRange);
  const currency = chosenCurrency || statisticsCurrency(settings.mainCurrency) || 'CNY';
  const currencies = useMemo(() => [...new Set([currency, ...accounts.map(account => statisticsCurrency(account.currency)).filter((value): value is string => Boolean(value))])].sort(), [accounts, currency]);
  const selection = useMemo(() => selectStatisticsRecords(transactions, accounts, dateRange, currency), [transactions, accounts, dateRange, currency]);
  const records = selection.records;
  const periods = useMemo(() => statisticsPeriodKeys(dateRange, period), [dateRange, period]);
  const primaryCategories = useMemo(() => categories.filter(category => category.type === categoryType && !category.parentId), [categories, categoryType]);
  // A removed or retyped category must not silently leave the page stuck on an invisible filter.
  const selectedPrimaryId = primaryCategories.some(category => category.id === primaryCategoryId) ? primaryCategoryId : '';
  const categoryRows = useMemo(() => statisticsCategoryRows(records, categories, categoryType, selectedPrimaryId, selectedPrimaryId ? text.secondaryUnassigned : text.unassigned), [records, categories, categoryType, selectedPrimaryId, text]);
  const totalIncome = useMemo(() => sumStatisticsAmounts(records.filter(tx => tx.type === 'income')), [records]);
  const totalExpense = useMemo(() => sumStatisticsAmounts(records.filter(tx => tx.type === 'expense')), [records]);
  const categoryTotal = categoryRows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const rankedCategories = categoryRows.map((row, index) => ({ ...row, color: palette.categories[index % palette.categories.length] })).filter(row => row.count > 0).sort((a, b) => b.amount - a.amount);
  const money = (amount: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  const formatDate = (date: string, options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) => new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
  const rangeLabel = rangeError ? text.custom : !custom && rangeScope === 'year' ? formatDate(dateRange.start, { year: 'numeric' }) : !custom && rangeScope === 'month' ? formatDate(dateRange.start, { year: 'numeric', month: 'long' }) : dateRange.start === dateRange.end ? formatDate(dateRange.start) : `${dateRange.start.replace(/-/g, '/')} – ${dateRange.end.replace(/-/g, '/')}`;
  const labels = periods.keys.map(key => period === 'year' ? key.slice(0, 4) : period === 'month' ? key.slice(0, 7) : period === 'week' ? key : formatDate(key, { month: 'short', day: 'numeric' }));
  const groupedAmounts = (items: typeof records) => {
    const amounts = new Map<string, number>();
    for (const tx of items) {
      const day = statisticsRecordDate(tx.date);
      if (!day) continue;
      const key = statisticsPeriodKey(day, period);
      amounts.set(key, (amounts.get(key) || 0) + Math.round(tx.amount * 100));
    }
    return periods.keys.map(key => (amounts.get(key) || 0) / 100);
  };
  const trendData = {
    labels,
    datasets: [
      { label: t('accounting.income'), data: groupedAmounts(records.filter(tx => tx.type === 'income')), borderColor: palette.income, backgroundColor: palette.income, hidden: !visibleSeries.income, tension: 0.25, pointRadius: periods.keys.length > 60 ? 0 : 3 },
      { label: t('accounting.expense'), data: groupedAmounts(records.filter(tx => tx.type === 'expense')), borderColor: palette.expense, backgroundColor: palette.expense, hidden: !visibleSeries.expense, tension: 0.25, pointRadius: periods.keys.length > 60 ? 0 : 3 },
    ],
  };
  const categoryData = { labels, datasets: categoryRows.filter(row => row.count > 0).map(row => ({ label: row.name, data: groupedAmounts(row.records), backgroundColor: palette.categories[categoryRows.indexOf(row) % palette.categories.length], borderRadius: 4 })) };
  const totalCategoryData = { labels: rankedCategories.map(row => row.name), datasets: [{ label: t(`accounting.${categoryType}`), data: rankedCategories.map(row => row.amount), backgroundColor: rankedCategories.map(row => row.color), borderRadius: 6, maxBarThickness: 58 }] };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { labels: { color: palette.muted, usePointStyle: true, boxWidth: 8 } },
      tooltip: { callbacks: { label: (context: TooltipItem<'line' | 'bar'>) => `${context.dataset.label || ''}: ${money(Number(context.parsed.y) || 0)}` } },
    },
    scales: { y: { beginAtZero: true, grid: { color: palette.grid }, ticks: { color: palette.muted }, title: { display: true, text: currency, color: palette.muted } }, x: { grid: { display: false }, ticks: { color: palette.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } } },
  };

  const nearbyAnchor = (step: number): string | null => { try { return shiftStatisticsPeriod(anchor, rangeScope, step); } catch { return null; } };
  const previousAnchor = nearbyAnchor(-1), nextAnchor = nearbyAnchor(1);
  const atCurrent = !custom && dateRange.start === statisticsPeriodBounds(todayStatisticsDate(), rangeScope).start;
  const chooseScope = (scope: StatisticsPeriod) => {
    if (custom) setAnchor(isStatisticsDate(customRange.start) ? customRange.start : todayStatisticsDate());
    setRangeScope(scope); setCustom(false);
  };
  const updateCustomRange = (key: 'start' | 'end', value: string) => { setCustomRange({ ...dateRange, [key]: value }); setCustom(true); };
  const empty = <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-5 text-center text-gray-500"><BarChart3 className="h-8 w-8 opacity-50" aria-hidden="true" /><strong className="font-medium text-gray-700">{text.noData}</strong><p className="text-sm">{text.emptyHint}</p></div>;
  const chartBlocked = rangeError ? <p className="py-16 text-center text-sm text-gray-500">{text[rangeError === 'invalid' ? 'rangeInvalid' : 'rangeReversed']}</p> : periods.tooMany ? <p className="py-16 px-6 text-center text-sm leading-7 text-gray-500">{text.tooMany}</p> : null;
  const controlClass = 'rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600';
  const panelClass = 'min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div><h1 className="text-2xl font-bold text-gray-900">{text.title}</h1><p className="mt-2 text-sm text-gray-500">{text.subtitle}</p></div>
        <div className="flex w-full flex-col gap-3 sm:w-auto" aria-label={text.range}>
          <div className="flex rounded-xl bg-gray-100 p-1" role="group" aria-label={text.browse}>
            {SCOPES.map(value => <button key={value} type="button" aria-pressed={!custom && rangeScope === value} onClick={() => chooseScope(value)} className={`min-w-11 flex-1 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-green-600 ${!custom && rangeScope === value ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white'}`}>{t(`statistics.period.${value}`)}</button>)}
            <button type="button" aria-pressed={custom} onClick={() => { setCustomRange(dateRange); setCustom(true); }} className={`rounded-lg px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-green-600 ${custom ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-white'}`}>{text.custom}</button>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
            <button type="button" disabled={custom || !previousAnchor} aria-label={`${text.previous}${t(`statistics.period.${rangeScope}`)}`} onClick={() => previousAnchor && setAnchor(previousAnchor)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-green-600"><ChevronLeft size={18} /></button>
            <span className="min-w-0 flex-1 px-1 text-center text-xs font-medium tabular-nums sm:min-w-44 sm:text-sm" aria-live="polite">{rangeLabel}</span>
            <button type="button" disabled={custom || !nextAnchor} aria-label={`${text.next}${t(`statistics.period.${rangeScope}`)}`} onClick={() => nextAnchor && setAnchor(nextAnchor)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-green-600"><ChevronRight size={18} /></button>
            <button type="button" disabled={atCurrent} onClick={() => { setAnchor(todayStatisticsDate()); setCustom(false); }} className="whitespace-nowrap rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700 disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-green-600">{text.current[rangeScope]}</button>
          </div>
        </div>
      </header>

      <section className={panelClass} aria-label={text.range}>
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-0 flex-1 sm:flex-none"><span className="mb-2 block text-xs font-medium text-gray-500">{t('statistics.startDate')}</span><input type="date" min="0001-01-01" max="9999-12-31" className={`${controlClass} w-full min-w-0`} value={dateRange.start} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? 'statistics-range-error' : undefined} onChange={event => updateCustomRange('start', event.target.value)} /></label>
          <label className="min-w-0 flex-1 sm:flex-none"><span className="mb-2 block text-xs font-medium text-gray-500">{t('statistics.endDate')}</span><input type="date" min="0001-01-01" max="9999-12-31" className={`${controlClass} w-full min-w-0`} value={dateRange.end} aria-invalid={Boolean(rangeError)} aria-describedby={rangeError ? 'statistics-range-error' : undefined} onChange={event => updateCustomRange('end', event.target.value)} /></label>
          <label><span className="mb-2 block text-xs font-medium text-gray-500">{text.currency}</span><select className={controlClass} value={currency} onChange={event => setChosenCurrency(event.target.value)}>{currencies.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
          <p className="w-full text-xs leading-5 text-gray-500 sm:w-auto sm:flex-1 sm:text-right">{text.currencyNote}</p>
        </div>
        {custom && <p className="mt-3 text-xs text-gray-500">{text.customHint}</p>}
        {rangeError && <p id="statistics-range-error" role="alert" className="mt-3 text-sm text-red-600">{text[rangeError === 'invalid' ? 'rangeInvalid' : 'rangeReversed']}</p>}
        {selection.unknownCurrencyCount > 0 && <p role="status" className="mt-3 text-sm text-amber-700">{selection.unknownCurrencyCount} {text.unknown}</p>}
        {selection.invalidAmountCount > 0 && <p role="status" className="mt-3 text-sm text-amber-700">{selection.invalidAmountCount} {text.invalidAmount}</p>}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5" aria-label={`${rangeLabel} · ${currency}`}>
        {[
          { label: t('accounting.expense'), amount: totalExpense, Icon: ArrowUpRight, color: palette.expense, foot: rangeLabel },
          { label: t('accounting.income'), amount: totalIncome, Icon: ArrowDownLeft, color: palette.income, foot: `${records.length} ${text.records}` },
          { label: text.balance, amount: Math.round((totalIncome - totalExpense) * 100) / 100, Icon: Wallet, color: palette.ink, foot: text.noTransfers },
        ].map(({ label, amount, Icon, color, foot }) => <div key={label} className={panelClass}><div className="flex items-center gap-2 text-xs text-gray-500"><Icon size={16} style={{ color }} aria-hidden="true" />{label}</div><p className="mt-3 break-words text-2xl font-semibold tabular-nums text-gray-900 lg:text-3xl">{rangeError ? '—' : money(amount)}</p><p className="mt-3 text-xs leading-5 text-gray-500">{foot}</p></div>)}
      </section>

      <section className={panelClass} aria-labelledby="statistics-trend-title">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h2 id="statistics-trend-title" className="text-lg font-semibold text-gray-900">{text.trend}</h2>
          <label className="flex items-center gap-2 text-xs text-gray-500">{text.aggregation}<select className={controlClass} value={period} onChange={event => setPeriod(event.target.value as StatisticsPeriod)}>{SCOPES.map(value => <option key={value} value={value}>{t(`statistics.period.${value}`)}</option>)}</select></label>
          <div className="flex items-center gap-4">{(['income', 'expense'] as const).map(type => <label key={type} className="flex cursor-pointer items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={visibleSeries[type]} onChange={event => setVisibleSeries(previous => ({ ...previous, [type]: event.target.checked }))} className="h-4 w-4 rounded accent-green-600" /><span>{t(`accounting.${type}`)}</span></label>)}</div>
        </div>
        {chartBlocked || (records.length ? <div className="h-72 sm:h-80"><Line data={trendData} options={{ ...chartOptions, plugins: { ...chartOptions.plugins, legend: { ...chartOptions.plugins.legend, onClick: (_event, item) => { const type = item.datasetIndex === 0 ? 'income' : 'expense'; setVisibleSeries(previous => ({ ...previous, [type]: !previous[type] })); } } } }} aria-label={`${text.trend} · ${rangeLabel} · ${currency}`} role="img" /></div> : empty)}
        <p className="mt-4 text-xs text-gray-500">{rangeLabel} · {currency} · {text.noTransfers}</p>
      </section>

      <section className={panelClass} aria-labelledby="statistics-category-title">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div><h2 id="statistics-category-title" className="text-lg font-semibold text-gray-900">{text.category}</h2><p className="mt-2 text-xs text-gray-500">{rangeLabel} · {currency} · {text.ranked}</p></div>
          <div className="flex max-w-full flex-wrap gap-3">
            <label><span className="mb-2 block text-xs text-gray-500">{t('accounting.type')}</span><select className={controlClass} value={categoryType} onChange={event => { setCategoryType(event.target.value as 'expense' | 'income'); setPrimaryCategoryId(''); }}><option value="expense">{t('accounting.expense')}</option><option value="income">{t('accounting.income')}</option></select></label>
            <label className="min-w-0"><span className="mb-2 block text-xs text-gray-500">{t('statistics.categoryLevel')}</span><select className={`${controlClass} max-w-full`} value={selectedPrimaryId} onChange={event => setPrimaryCategoryId(event.target.value)}><option value="">{t('statistics.allPrimary')}</option>{primaryCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          </div>
        </div>
        {rangeError ? chartBlocked : rankedCategories.length ? <>
          <p className="mb-4 text-sm text-gray-500">{t(`accounting.${categoryType}`)} <strong className="ml-2 text-lg font-semibold tabular-nums text-gray-900">{money(categoryTotal)}</strong></p>
          <div className="overflow-x-auto pb-2"><div className="h-80" style={{ minWidth: Math.max(260, rankedCategories.length * 90) }}><Bar data={totalCategoryData} options={{ ...chartOptions, interaction: { mode: 'nearest', intersect: false }, plugins: { ...chartOptions.plugins, legend: { display: false }, tooltip: { callbacks: { label: context => money(Number(context.parsed.y) || 0), afterLabel: context => { const row = rankedCategories[context.dataIndex]; return `${row.count} ${text.count} · ${text.share} ${categoryTotal ? (row.amount / categoryTotal * 100).toFixed(1) : '0.0'}%`; } } } }, scales: { ...chartOptions.scales, x: { ...chartOptions.scales.x, ticks: { color: palette.muted, maxRotation: 0, autoSkip: false } } } }} aria-label={`${text.category} · ${rangeLabel} · ${currency}`} role="img" /></div></div>
          <ul className="sr-only">{rankedCategories.map(row => <li key={row.id}>{row.name}: {money(row.amount)}, {row.count} {text.count}</li>)}</ul>
        </> : empty}
      </section>

      <section className={panelClass} aria-labelledby="statistics-category-time-title">
        <h2 id="statistics-category-time-title" className="text-lg font-semibold text-gray-900">{text.categoryOverTime}</h2>
        <p className="mb-5 mt-2 text-xs text-gray-500">{t(selectedPrimaryId ? 'statistics.secondaryBreakdown' : 'statistics.primaryBreakdown').replace('{period}', t(`statistics.period.${period}`))} · {currency}</p>
        {chartBlocked || (rankedCategories.length ? <div className="h-80"><Bar data={categoryData} options={chartOptions} aria-label={`${text.categoryOverTime} · ${rangeLabel} · ${currency}`} role="img" /></div> : empty)}
      </section>
    </div>
  );
};
