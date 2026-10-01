import { Link, useLocation } from 'react-router-dom';
import { LogOut, Plus, Sparkles, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { ThemePicker } from '../ui/ThemePicker';

export function AppHeader() {
  const { t, language } = useI18n();
  const { signOut } = useAuth();
  const { pathname } = useLocation();
  const labels: Record<string, string> = { '/': 'nav.accounting', '/records': 'nav.records', '/statistics': 'nav.statistics', '/accounts': 'nav.accounts', '/categories': 'nav.categories', '/storage': 'nav.storage' };
  return (
    <header className="pa-topbar">
      <div className="pa-breadcrumb"><span>{language === 'zh' ? '我的账本' : 'My ledger'}</span><ChevronRight size={13} /><strong>{t(labels[pathname] || 'nav.accounting')}</strong></div>
      <div className="pa-top-actions">
        <ThemePicker language={language} />
        <Link className="pa-entry-link" to="/?mode=ai" aria-label={language === 'zh' ? 'AI 记账' : 'AI entry'}><Sparkles size={16} /><span>AI {language === 'zh' ? '记账' : 'entry'}</span></Link>
        <Link className="pa-entry-link pa-entry-primary" to="/?mode=manual" aria-label={language === 'zh' ? '手工记账' : 'Manual entry'}><Plus size={17} /><span>{language === 'zh' ? '手工记账' : 'Manual entry'}</span></Link>
        <button type="button" onClick={() => void signOut()} className="pa-icon-button" title={language === 'zh' ? '退出登录' : 'Sign out'} aria-label={language === 'zh' ? '退出登录' : 'Sign out'}><LogOut size={17} /></button>
      </div>
    </header>
  );
}
