import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect } from 'react';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import LoadingSpinner from './components/common/LoadingSpinner';
import RequireAuth from './components/auth/RequireAuth';
import { authApi } from './utils/authApi';

// 路由懒加载 - 提升首屏加载性能
const HomePage = lazy(() => import('./pages/HomePage'));
const UserWorksPage = lazy(() => import('./pages/UserWorksPage'));
const NovelPage = lazy(() => import('./pages/NovelPage'));
const ScriptPage = lazy(() => import('./pages/ScriptPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const UGCPlaza = lazy(() => import('./pages/UGCPlaza'));
const NovelEditorPage = lazy(() => import('./pages/NovelEditorPage'));
const ScriptEditorPage = lazy(() => import('./pages/ScriptEditorPage'));
const Editor = lazy(() => import('./components/Editor'));

/** /works 重定向到当前用户的个人主页 /users/:userId */
function RedirectToMyWorks() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const run = async () => {
      if (authApi.isAuthenticated()) {
        const u = authApi.getUserInfo();
        if (u?.id) setUserId(u.id);
        else {
          try {
            const user = await authApi.getCurrentUser();
            if (user?.id) setUserId(user.id);
          } catch {
            // ignore error
          }
        }
      }
      setLoading(false);
    };
    run();
  }, []);
  if (loading) return <LoadingSpinner />;
  return <Navigate to={userId ? `/users/${userId}` : '/'} replace />;
}

function AppContent() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen message="加载中..." />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/works" element={<RedirectToMyWorks />} />
          <Route path="/users/:userId" element={<RequireAuth><UserWorksPage /></RequireAuth>} />
          <Route path="/novel" element={<NovelPage />} />
          <Route path="/script" element={<ScriptPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/ugc-plaza" element={<UGCPlaza />} />
        </Route>
        <Route path="/novel/editor" element={<RequireAuth><NovelEditorPage /></RequireAuth>} />
        <Route path="/script/editor" element={<RequireAuth><ScriptEditorPage /></RequireAuth>} />
        <Route
          path="/editor-old"
          element={<Editor docId={null} onDocChange={() => {}} />}
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
