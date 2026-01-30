import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext';
import { Layout } from './components/layout/Layout';
import { AccountingPage } from './pages/AccountingPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { AccountsPage } from './pages/AccountsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { StoragePage } from './pages/StoragePage';

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<AccountingPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="statistics" element={<StatisticsPage />} />
            <Route path="storage" element={<StoragePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
