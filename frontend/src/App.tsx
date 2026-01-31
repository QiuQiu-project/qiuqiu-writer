import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import LoadingSpinner from './components/common/LoadingSpinner';

// 路由懒加载 - 提升首屏加载性能
const HomePage = lazy(() => import('./pages/HomePage'));
const UserWorksPage = lazy(() => import('./pages/UserWorksPage'));
const WorksPage = lazy(() => import('./pages/WorksPage'));
const NovelPage = lazy(() => import('./pages/NovelPage'));
const ScriptPage = lazy(() => import('./pages/ScriptPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const UGCPlaza = lazy(() => import('./pages/UGCPlaza'));
const NovelEditorPage = lazy(() => import('./pages/NovelEditorPage'));
const ScriptEditorPage = lazy(() => import('./pages/ScriptEditorPage'));
const Editor = lazy(() => import('./components/Editor'));

function AppContent() {
  return (
    <Suspense fallback={<LoadingSpinner fullScreen message="加载中..." />}>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/works" element={<WorksPage />} />
          <Route path="/users/:userId" element={<UserWorksPage />} />
          <Route path="/novel" element={<NovelPage />} />
          <Route path="/script" element={<ScriptPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/ugc-plaza" element={<UGCPlaza />} />
        </Route>
        <Route path="/novel/editor" element={<NovelEditorPage />} />
        <Route path="/script/editor" element={<ScriptEditorPage />} />
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
