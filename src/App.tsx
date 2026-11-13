import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedLayout } from './components/layout/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProjectsPage } from './pages/projects/ProjectsPage';
import { ProjectDetailPage } from './pages/projects/ProjectDetailPage';
import { HandoversPage } from './pages/handovers/HandoversPage';
import { CreateHandoverPage } from './pages/handovers/CreateHandoverPage';
import { HandoverWorkspacePage } from './pages/handovers/HandoverWorkspacePage';
import { SuccessorPortalPage } from './pages/successor/SuccessorPortalPage';
import { UsersAdminPage } from './pages/admin/UsersAdminPage';
import { IntegrationsPage } from './pages/admin/IntegrationsPage';
import { RedactionRulesPage } from './pages/admin/RedactionRulesPage';
import { AuditLogsPage } from './pages/admin/AuditLogsPage';

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Authentication Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />

            {/* Protected Application Routes */}
            <Route element={<ProtectedLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectDetailPage />} />
              <Route path="/successor" element={<SuccessorPortalPage />} />
              <Route path="/admin/redaction" element={<RedactionRulesPage />} />
              <Route path="/admin/integrations" element={<IntegrationsPage />} />
              <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
            </Route>

            {/* Handover Creation & Workspace (Admin, Team Leader, Departing Member) */}
            <Route
              element={
                <ProtectedLayout
                  allowedRoles={['ADMIN', 'TEAM_LEADER', 'DEPARTING_MEMBER']}
                />
              }
            >
              <Route path="/handovers" element={<HandoversPage />} />
              <Route path="/handovers/:id" element={<HandoverWorkspacePage />} />
            </Route>

            <Route
              element={
                <ProtectedLayout allowedRoles={['ADMIN', 'TEAM_LEADER']} />
              }
            >
              <Route path="/handovers/new" element={<CreateHandoverPage />} />
            </Route>

            {/* Strict Admin-Only User & Role Management */}
            <Route element={<ProtectedLayout allowedRoles={['ADMIN']} />}>
              <Route path="/admin/users" element={<UsersAdminPage />} />
            </Route>

            {/* Default Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
};

export default App;
