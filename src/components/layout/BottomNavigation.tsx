import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, PieChart, Wallet, BarChart2, HardDrive, List } from 'lucide-react';
import { clsx } from 'clsx';
import { useI18n } from '../../i18n';

export const BottomNavigation: React.FC = () => {
  const { t } = useI18n();
  const navItems = [
    { to: '/', icon: Home, label: t('nav.accounting') },
    { to: '/records', icon: List, label: t('nav.records') },
    { to: '/categories', icon: PieChart, label: t('nav.categories') },
    { to: '/accounts', icon: Wallet, label: t('nav.accounts') },
    { to: '/statistics', icon: BarChart2, label: t('nav.statistics') },
    { to: '/storage', icon: HardDrive, label: t('nav.storage') },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t bg-white pb-safe z-40">
      <nav className="flex h-16 justify-around items-center max-w-5xl mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center w-full h-full space-y-1',
                isActive ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'
              )
            }
          >
            <Icon className="h-6 w-6" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
