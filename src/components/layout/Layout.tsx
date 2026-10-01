import { Outlet } from 'react-router-dom';
import { BookOpen, ShieldCheck } from 'lucide-react';
import { BottomNavigation } from './BottomNavigation';
import { AppHeader } from './AppHeader';
import { NavigationLinks } from './NavigationLinks';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { useI18n } from '../../i18n';

export function Layout() {
  const { user } = useAuth();
  const { syncError } = useAppContext();
  const { t, language } = useI18n();
  return (
    <div className="pa-shell">
      <a className="pa-skip-link" href="#main-content">{language === 'zh' ? '跳到内容' : 'Skip to content'}</a>
      <aside className="pa-sidebar">
        <div className="pa-brand"><span className="pa-brand-icon"><BookOpen size={23} /></span><div><strong>{t('app.name')}</strong><small>PERSONAL ACCOUNTING</small></div></div>
        <p className="pa-nav-caption">{language === 'zh' ? '我的账本' : 'MY LEDGER'}</p>
        <nav aria-label={language === 'zh' ? '主导航' : 'Main navigation'}><NavigationLinks /></nav>
        <div className="pa-sidebar-bottom">
          <div className="pa-sidebar-note"><ShieldCheck size={17} /><span>{language === 'zh' ? '账户与账本按用户独立存储' : 'Your account and ledger stay separate'}</span></div>
          <div className="pa-profile"><span className="pa-avatar">{(user?.name || user?.email || 'P').slice(0, 1).toUpperCase()}</span><div><strong>{user?.name || t('app.name')}</strong><small title={user?.email}>{user?.email}</small></div></div>
        </div>
      </aside>
      <div className="pa-main">
        <AppHeader />
        {syncError && <div role="alert" className="pa-sync-error">{language === 'zh' ? '同步遇到问题，请检查账本后重试：' : 'Sync issue. Check your ledger before retrying: '}{syncError}</div>}
        <main id="main-content" className="pa-page"><Outlet /></main>
        <footer className="pa-footer">{language === 'zh' ? '认真记录，让每一笔都有来处' : 'A little clarity, one transaction at a time'}</footer>
      </div>
      <BottomNavigation />
    </div>
  );
}
