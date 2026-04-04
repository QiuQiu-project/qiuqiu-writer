import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect } from 'react';
import MainLayout from './components/layout/MainLayout';
import LoadingSpinner from './components/common/LoadingSpinner';
import RequireAuth from './components/auth/RequireAuth';
import LoginModal from './components/auth/LoginModal';
import QuotaExceededModal from './components/common/QuotaExceededModal';
import ImageLightbox from './components/common/ImageLightbox';
import { authApi } from './utils/authApi';
import { tokenApi } from './utils/tokenApi';

// 路由懒加载 - 提升首屏加载性能
const HomePage = lazy(() => import('./pages/HomePage'));
const WorksPage = lazy(() => import('./pages/WorksPage'));
const UGCPlaza = lazy(() => import('./pages/UGCPlaza'));
const NovelEditorPage = lazy(() => import('./pages/NovelEditorPage'));
const PlansPage = lazy(() => import('./pages/PlansPage'));
const TransactionsPage = lazy(() => import('./pages/TransactionsPage'));
const DramaEditorPage = lazy(() => import('./pages/DramaEditorPage'));

function AppContent() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen message="加载中..." />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/novel" element={<WorksPage />} />
          <Route path="/ugc-plaza" element={<UGCPlaza />} />
          <Route path="/plans" element={<RequireAuth><PlansPage /></RequireAuth>} />
          <Route path="/transactions" element={<RequireAuth><TransactionsPage /></RequireAuth>} />
          <Route path="/drama" element={<RequireAuth><Navigate to="/novel?section=workbench&type=video" replace /></RequireAuth>} />
          <Route path="/works" element={<Navigate to="/novel?section=workbench" replace />} />
        </Route>
        <Route path="/novel/editor" element={<RequireAuth><NovelEditorPage /></RequireAuth>} />
        <Route path="/drama/editor" element={<RequireAuth><DramaEditorPage /></RequireAuth>} />
      </Routes>
    </Suspense>
  );
}

function App() {
  const [sessionExpiredOpen, setSessionExpiredOpen] = useState(false);
  const [quotaExceededOpen, setQuotaExceededOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>('free');

  // 拉取当前用户套餐（已登录时）
  useEffect(() => {
    if (!authApi.isAuthenticated()) return;
    tokenApi.getTokenInfo()
      .then((info) => setCurrentPlan(info.plan))
      .catch(() => {/* 静默失败，保持默认 free */});
  }, []);

  useEffect(() => {
    const handler = () => {
      // 只在已登录状态下弹出（避免未登录的接口请求也触发）
      if (authApi.isAuthenticated()) {
        authApi.clearToken();
        setSessionExpiredOpen(true);
      }
    };
    window.addEventListener('auth:session-expired', handler);
    return () => window.removeEventListener('auth:session-expired', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      // 弹出前刷新一次套餐信息，确保展示最新状态
      if (authApi.isAuthenticated()) {
        tokenApi.getTokenInfo()
          .then((info) => setCurrentPlan(info.plan))
          .catch(() => {});
      }
      setQuotaExceededOpen(true);
    };
    window.addEventListener('token:quota-exceeded', handler);
    return () => window.removeEventListener('token:quota-exceeded', handler);
  }, []);

  return (
    <Router>
      <AppContent />
      <LoginModal
        isOpen={sessionExpiredOpen}
        onClose={() => setSessionExpiredOpen(false)}
        onLoginSuccess={() => setSessionExpiredOpen(false)}
      />
      <QuotaExceededModal
        isOpen={quotaExceededOpen}
        onClose={() => setQuotaExceededOpen(false)}
        currentPlan={currentPlan}
      />
      <ImageLightbox />
    </Router>
  );
}

export default App;
