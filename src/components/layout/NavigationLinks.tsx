import { NavLink } from 'react-router-dom';
import { BookOpen, List, ChartColumn, Wallet, Shapes, Settings } from 'lucide-react';
import { useI18n } from '../../i18n';

export function NavigationLinks() {
  const { t } = useI18n();
  const items = [
    { to: '/', icon: BookOpen, label: t('nav.accounting') },
    { to: '/records', icon: List, label: t('nav.records') },
    { to: '/statistics', icon: ChartColumn, label: t('nav.statistics') },
    { to: '/accounts', icon: Wallet, label: t('nav.accounts') },
    { to: '/categories', icon: Shapes, label: t('nav.categories') },
    { to: '/storage', icon: Settings, label: t('nav.storage') },
  ];
  return items.map(({ to, icon: Icon, label }) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `pa-nav-link${isActive ? ' active' : ''}`}>
      <Icon size={20} aria-hidden="true" /><span>{label}</span>
    </NavLink>
  ));
}
