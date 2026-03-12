import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Works from './pages/Works';
import PromptTemplates from './pages/PromptTemplates';
import WorkTemplateDetail from './pages/PromptTemplates/WorkTemplateDetail';
import GlobalPrompts from './pages/GlobalPrompts';
import SystemSettings from './pages/SystemSettings';
import AuditLogs from './pages/AuditLogs';
import Cubes from './pages/Cubes';
import Maintenance from './pages/Maintenance';
import InvitationCodes from './pages/InvitationCodes';
import Feedback from './pages/Feedback';
import Plans from './pages/Plans';

// Simple Auth Guard
const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <MainLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="users" element={<Users />} />
          <Route path="plans" element={<Plans />} />
          <Route path="works" element={<Works />} />
          <Route path="cubes" element={<Cubes />} />
          <Route path="prompt-templates" element={<PromptTemplates />} />
          <Route path="prompt-templates/:id" element={<WorkTemplateDetail />} />
          <Route path="global-prompts" element={<GlobalPrompts />} />
          <Route path="system-settings" element={<SystemSettings />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="invitation-codes" element={<InvitationCodes />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="feedback" element={<Feedback />} />
          <Route path="settings" element={<div>Settings (Coming Soon)</div>} />
        </Route>
      </Routes>
    </Router>
  );
};

export default App;
