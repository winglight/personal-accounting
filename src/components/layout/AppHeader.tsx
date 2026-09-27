import React from 'react';
import { useI18n } from '../../i18n';
import logo from '../../assets/logo.svg';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const AppHeader: React.FC = () => {
  const { t } = useI18n();
  const { user, signOut } = useAuth();

  return (
    <div className="flex items-center gap-3 mb-6">
      <img src={logo} alt={t('app.name')} className="h-10 w-10 rounded-lg" />
      <div className="leading-tight">
        <div className="text-lg font-semibold text-gray-900">{t('app.name')}</div>
      </div>
      <div className="ml-auto flex items-center gap-2 min-w-0">
        <span className="hidden sm:block max-w-48 truncate text-xs text-gray-500">{user?.email}</span>
        <button type="button" onClick={() => void signOut()} className="rounded-md p-2 text-gray-500 hover:bg-gray-100" title="退出登录" aria-label="退出登录"><LogOut className="h-4 w-4" /></button>
      </div>
    </div>
  );
};
