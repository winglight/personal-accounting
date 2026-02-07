import React, { useEffect } from 'react';
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

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-gray-900 gap-4 p-6">
          <div className="text-lg font-semibold">页面加载失败</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-green-600 text-white px-4 py-2 text-sm font-medium"
          >
            刷新页面
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const AppContent: React.FC = () => {
  const { settings } = useAppContext();
  useEffect(() => {
    const key = '__pa_bfcache__';
    const handlePageHide = () => {
      sessionStorage.setItem(key, '1');
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      const shouldReload = event.persisted || sessionStorage.getItem(key) === '1';
      if (shouldReload) {
        sessionStorage.removeItem(key);
        window.location.reload();
      }
    };
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);
  return (
    <I18nProvider language={settings.language}>
      <ErrorBoundary>
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
      </ErrorBoundary>
    </I18nProvider>
  );
};
