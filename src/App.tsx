import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { Layout } from './components/layout/Layout';
import { AccountingPage } from './pages/AccountingPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { AccountsPage } from './pages/AccountsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { StoragePage } from './pages/StoragePage';
import { RecordsPage } from './pages/RecordsPage';
import { I18nProvider } from './i18n';
import { useAppContext } from './contexts/AppContext';

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;

const AppContent: React.FC = () => {
  const { settings } = useAppContext();
  return (
    <I18nProvider language={settings.language}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<AccountingPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="storage" element={<StoragePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  );
};
