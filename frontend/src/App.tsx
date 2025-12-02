import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import Editor from './components/Editor';
import UGCPlaza from './pages/UGCPlaza';
import EditorPage from './pages/EditorPage';
import HomePage from './pages/HomePage';
import WorksPage from './pages/WorksPage';
import NovelPage from './pages/NovelPage';
import NovelEditorPage from './pages/NovelEditorPage';
import ScriptPage from './pages/ScriptPage';
import ScriptEditorPage from './pages/ScriptEditorPage';
import MainLayout from './components/layout/MainLayout';

function AppContent() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/works" element={<WorksPage />} />
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
