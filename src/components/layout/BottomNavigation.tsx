import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, PieChart, Wallet, BarChart2, HardDrive } from 'lucide-react';
import { clsx } from 'clsx';

export const BottomNavigation: React.FC = () => {
  const navItems = [
    { to: '/', icon: Home, label: 'Accounting' },
    { to: '/categories', icon: PieChart, label: 'Categories' },
    { to: '/accounts', icon: Wallet, label: 'Accounts' },
    { to: '/statistics', icon: BarChart2, label: 'Stats' },
    { to: '/storage', icon: HardDrive, label: 'Storage' },
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
