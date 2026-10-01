import { Link, useSearchParams } from 'react-router-dom';
import { PencilLine, Sparkles, ArrowRightLeft } from 'lucide-react';
import { useAppContext } from '../contexts/AppContext';
import { TransactionForm } from '../components/accounting/TransactionForm';
import { TodayRecords } from '../components/accounting/TodayRecords';
import { WeeklyChart } from '../components/accounting/WeeklyChart';
import { AIChat } from '../components/accounting/AIChat';
import { LedgerSummary } from '../components/accounting/LedgerSummary';
import { useI18n } from '../i18n';

export function AccountingPage() {
  const { settings } = useAppContext();
  const { language } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'ai' ? 'ai' : 'manual';
  const aiReady = Boolean(settings.aiConfig?.enabled && settings.aiConfig?.token && settings.aiConfig?.apiUrl);
  const selectMode = (value: string) => setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('mode', value); return next; }, { replace: true });
  return (
    <div className="space-y-6">
      <div className="pa-pagehead"><div><h1>{language === 'zh' ? '每一笔，都清清楚楚' : 'Every transaction, in view'}</h1><p>{language === 'zh' ? '记录日常收支，慢慢积累生活的底气' : 'Track the everyday, build a clearer picture'}</p></div><Link className="pa-text-link" to="/records">{language === 'zh' ? '查看全部明细 →' : 'All transactions →'}</Link></div>
      <LedgerSummary />
      <div className="pa-work-grid">
        <section className="pa-ledger-column"><TodayRecords /><WeeklyChart /></section>
        <aside className="pa-composer" aria-label={language === 'zh' ? '记一笔' : 'New entry'}>
          <div className="pa-composer-head"><h2>{language === 'zh' ? '记一笔' : 'New entry'}</h2><Link to="/accounts" className="pa-text-link"><ArrowRightLeft size={14} />{language === 'zh' ? '手动转账' : 'Manual transfer'}</Link></div>
          <div className="pa-mode-switch" role="group" aria-label={language === 'zh' ? '记账方式' : 'Entry method'}>
            <button type="button" aria-pressed={mode === 'manual'} onClick={() => selectMode('manual')}><PencilLine size={15} />{language === 'zh' ? '手工记账' : 'Manual'}</button>
            <button type="button" aria-pressed={mode === 'ai'} onClick={() => selectMode('ai')}><Sparkles size={15} />AI {language === 'zh' ? '记账' : 'entry'}</button>
          </div>
          <div hidden={mode !== 'manual'}><TransactionForm /></div>
          <div hidden={mode !== 'ai'}>
            {aiReady ? <AIChat /> : <div className="pa-ai-setup"><Sparkles size={28} /><h3>{language === 'zh' ? '用一句话，记下日常' : 'Capture your day in a sentence'}</h3><p>{language === 'zh' ? '在设置中启用 AI 并配置文本和图片模型，即可输入描述或上传小票。识别结果始终由你审核确认。' : 'Enable AI and configure text and image models in Settings. Review results before adding them to your ledger.'}</p><Link to="/storage" className="pa-entry-link pa-entry-primary">{language === 'zh' ? '前往 AI 设置' : 'Set up AI'}</Link></div>}
          </div>
          <p className="pa-composer-note">{language === 'zh' ? '转账在账户页手动完成，不参与 AI 识别和收支统计' : 'Transfers are manual on Accounts and excluded from income/expenses'}</p>
        </aside>
      </div>
    </div>
  );
}
