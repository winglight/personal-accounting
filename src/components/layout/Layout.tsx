import React from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900 pb-20 md:pb-24">
      <main className="mx-auto max-w-5xl p-4 md:p-8 min-h-[calc(100vh-4rem)]">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  );
};
