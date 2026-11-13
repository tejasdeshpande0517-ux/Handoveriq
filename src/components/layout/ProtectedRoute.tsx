import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../types';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export const ProtectedLayout: React.FC<{ allowedRoles?: UserRole[] }> = ({
  allowedRoles,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eef8f7]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-3 border-teal-700 border-t-transparent animate-spin" />
          <p className="text-sm font-semibold text-slate-700">
            Loading HandoverIQ Workspace...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex bg-[#eef8f7]">
        <Sidebar
          collapsed={sidebarCollapsed}
          mobileOpen={mobileSidebarOpen}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onToggleMobileSidebar={() => setMobileSidebarOpen(true)} />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-lg animate-slide-in-up">
              <h2 className="text-lg font-bold text-slate-900">
                Access Restricted by RBAC Policy
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Your current role (<code className="font-mono font-semibold">{user.role}</code>) is not authorized to view this module. Required role:{' '}
                <code className="font-mono font-semibold">{allowedRoles.join(' or ')}</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex text-slate-900 relative overflow-x-hidden">
      {/* Background subtle aqua-mint glow waves matching Reference Image */}
      <div className="pointer-events-none fixed top-0 right-0 w-[520px] h-[520px] rounded-full bg-teal-300/20 blur-3xl -z-10" />
      <div className="pointer-events-none fixed bottom-0 left-1/3 w-[460px] h-[460px] rounded-full bg-cyan-300/15 blur-3xl -z-10" />

      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobileSidebar={() => setMobileSidebarOpen(true)} />
        <main
          key={location.pathname}
          className="flex-1 p-4 sm:p-6 lg:px-8 lg:py-6 max-w-[1480px] w-full mx-auto animate-slide-in-up"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};
