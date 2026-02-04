import React from 'react';
import { useI18n } from '../../i18n';
import logo from '../../assets/logo.svg';

export const AppHeader: React.FC = () => {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-3 mb-6">
      <img src={logo} alt={t('app.name')} className="h-10 w-10 rounded-lg" />
      <div className="leading-tight">
        <div className="text-lg font-semibold text-gray-900">{t('app.name')}</div>
      </div>
    </div>
  );
};
