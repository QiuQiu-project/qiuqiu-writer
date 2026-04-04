import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Info, ChevronDown, Menu, X, Wifi, WifiOff } from 'lucide-react';
import ScriptSideNav, { type ScriptNavItem, type ScriptEpisode } from '../components/editor/ScriptSideNav';
import TagsManager from '../components/editor/TagsManager';
import ChapterOutline from '../components/editor/ChapterOutline';
import ScriptCharacters from '../components/editor/ScriptCharacters';
import ScriptEditor from '../components/editor/ScriptEditor';
import WorkInfoManager from '../components/editor/WorkInfoManager';
import CollabAIPanel from '../components/editor/CollabAIPanel';
import ShareWorkModal from '../components/ShareWorkModal';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useYjsEditor } from '../hooks/useYjsEditor';
import { chaptersApi, type Chapter } from '../utils/chaptersApi';
import { worksApi, type Work } from '../utils/worksApi';
import type { WorkData } from '../components/editor/work-info/types';

const btnTextClass = 'h-8 px-2 bg-transparent border-none rounded-[7px] cursor-pointer flex items-center gap-[5px] text-[13px] transition-all shrink-0 hover:[background:var(--glass-bg-strong,rgba(255,255,255,0.07))] hover:[color:var(--text-primary)]';
const btnSecondarySmClass = 'h-7 px-2.5 text-xs rounded-[6px] border cursor-pointer transition-all flex items-center gap-1 whitespace-nowrap hover:[background:var(--glass-bg-strong,rgba(255,255,255,0.07))] hover:[border-color:var(--glass-border-strong,rgba(255,255,255,0.12))] hover:[color:var(--text-primary)]';

export default function ScriptEditorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workId = searchParams.get('workId');
  const isMobile = useIsMobile();
  const [activeNav, setActiveNav] = useState<ScriptNavItem>('work-info');
  const [scriptName, setScriptName] = useState('新剧本');
  const [work, setWork] = useState<Work | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [isEpisodeEditorOpen, setIsEpisodeEditorOpen] = useState(false);
  const [episodes, setEpisodes] = useState<Chapter[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [totalWordCount, setTotalWordCount] = useState(0);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // 加载作品信息
  useEffect(() => {
    if (!workId) return;
    worksApi.getWork(workId).then((w) => {
      setWork(w);
      setScriptName(w.title);
      setTotalWordCount(w.word_count ?? 0);
    }).catch(() => {});
  }, [workId]);

  // 加载剧集（章节）列表
  useEffect(() => {
    if (!workId) return;
    chaptersApi.listChapters({ work_id: workId }).then((data) => {
      const list = data.chapters;
      setEpisodes(list);
      if (list.length > 0 && selectedEpisode === null) {
        setSelectedEpisode(list[0].id);
      }
    }).catch(() => {});
  }, [workId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 新增剧集
  const handleAddEpisode = useCallback(async () => {
    if (!workId) return;
    try {
      const newEp = await chaptersApi.createChapter({
        work_id: workId,
        title: `第${episodes.length + 1}集`,
        chapter_number: episodes.length + 1,
      });
      setEpisodes((prev) => [...prev, newEp]);
      setSelectedEpisode(newEp.id);
      setIsEpisodeEditorOpen(true);
    } catch {
      // ignore
    }
  }, [workId, episodes.length]);

  // Yjs 协作编辑器（按当前剧集连接）
  const documentId =
    workId && selectedEpisode !== null
      ? `work_${workId}_chapter_${selectedEpisode}`
      : '';

  const { editor, connectionStatus } = useYjsEditor({
    documentId,
    placeholder: '开始编写剧本...支持 Markdown 格式，如 **粗体**、*斜体*、`代码`、# 标题等',
    editable: !!documentId,
    onUpdate: (html) => {
      const text = html.replace(/<[^>]+>/g, '');
      const matches = text.match(/[\u4e00-\u9fff\u3400-\u4dbfa-zA-Z0-9]/g);
      setTotalWordCount(matches?.length ?? 0);
    },
  });

  // 将章节列表转换为 ScriptEpisode 格式
  const episodeList: ScriptEpisode[] = episodes.map((ch) => ({
    id: ch.id,
    title: ch.title,
    word_count: ch.word_count ?? 0,
  }));

  const currentChapterId = selectedEpisode ?? undefined;

  const connIcon =
    connectionStatus === 'connected' ? (
      <Wifi size={12} style={{ color: 'var(--color-success, #52c41a)' }} />
    ) : connectionStatus === 'connecting' ? (
      <Wifi size={12} style={{ opacity: 0.5 }} />
    ) : (
      <WifiOff size={12} style={{ opacity: 0.4 }} />
    );

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden z-[2000]"
      style={{ background: 'var(--page-gradient, linear-gradient(160deg, #06091a 0%, #0c1630 45%, #06091a 100%))', color: 'var(--text-primary)' }}
    >
      {/* 移动端菜单抽屉 */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-[2100] flex justify-start backdrop-blur-[4px]"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-4/5 max-w-[300px] h-full flex flex-col [animation:slide-right_0.25s_ease-out] shadow-[var(--shadow-xl)]"
            style={{ background: 'var(--bg-primary)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="h-[52px] flex items-center justify-between px-4 border-b"
              style={{ borderColor: 'var(--border-light)' }}
            >
              <h2 className="m-0 text-base font-semibold" style={{ color: 'var(--text-primary)' }}>菜单</h2>
              <button
                className="bg-transparent border-none p-1 cursor-pointer rounded-[6px] hover:[background:var(--bg-tertiary)] hover:[color:var(--text-primary)]"
                style={{ color: 'var(--text-secondary)' }}
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-3">
              <ScriptSideNav
                activeNav={activeNav}
                onNavChange={(nav) => {
                  setActiveNav(nav);
                  if (nav === 'work-info') setIsEpisodeEditorOpen(false);
                  setMobileMenuOpen(false);
                }}
                selectedEpisode={selectedEpisode}
                onEpisodeSelect={(ep) => {
                  setSelectedEpisode(ep);
                  setIsEpisodeEditorOpen(true);
                  setMobileMenuOpen(false);
                }}
                episodes={episodeList}
                onAddEpisode={handleAddEpisode}
              />
            </div>
          </div>
        </div>
      )}

      {/* 顶部工具栏 */}
      <header
        className="h-[52px] min-h-[52px] flex items-center justify-between px-3 border-b shrink-0 z-10 gap-2 backdrop-blur-[12px] max-md:px-2 max-md:gap-1.5"
        style={{ borderColor: 'var(--glass-border, rgba(255,255,255,0.07))', background: 'var(--glass-bg, rgba(255,255,255,0.03))' }}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isMobile && (
            <button
              className={btnTextClass}
              style={{ color: 'var(--text-secondary)' }}
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
          )}
          <button
            className={btnTextClass}
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => navigate('/script')}
          >
            <ArrowLeft size={16} />
            {!isMobile && <span>退出</span>}
          </button>
          <div className="flex flex-col gap-[3px] flex-1 min-w-0 max-w-[500px] max-md:max-w-none">
            <input
              type="text"
              className="border-none bg-transparent text-[15px] font-semibold p-0 outline-none w-full whitespace-nowrap overflow-hidden text-ellipsis font-[inherit] placeholder:[color:var(--text-tertiary)] max-md:text-sm"
              style={{ color: 'var(--text-primary)' }}
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              placeholder="请输入剧本名称"
            />
            {!isMobile && (
              <div className="flex items-center gap-1.5 flex-nowrap">
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                  style={{ background: 'rgba(52,211,153,0.1)', color: 'rgba(52,211,153,0.85)' }}
                >
                  {connIcon}
                  {connectionStatus === 'connected'
                    ? '协作中'
                    : connectionStatus === 'connecting'
                    ? '连接中...'
                    : '已保存'}
                </span>
                <span
                  className="flex items-center gap-[3px] px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                  style={{ background: 'var(--glass-bg, rgba(255,255,255,0.04))', color: 'var(--text-tertiary)' }}
                >
                  总字数: {totalWordCount}
                  <Info size={12} />
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            {!isMobile && (
              <button
                className={btnTextClass}
                style={{ color: 'var(--text-secondary)' }}
              >
                <span>皮肤:</span>
                <ChevronDown size={14} />
              </button>
            )}
            {!isMobile && (
              <button
                className={btnSecondarySmClass}
                style={{ background: 'var(--glass-bg, rgba(255,255,255,0.04))', borderColor: 'var(--glass-border, rgba(255,255,255,0.08))', color: 'var(--text-secondary)' }}
              >
                替换
              </button>
            )}
            {!isMobile && (
              <button
                className={btnSecondarySmClass}
                style={{ background: 'var(--glass-bg, rgba(255,255,255,0.04))', borderColor: 'var(--glass-border, rgba(255,255,255,0.08))', color: 'var(--text-secondary)' }}
              >
                回收站
              </button>
            )}
            <button
              className={btnSecondarySmClass}
              style={{ background: 'var(--glass-bg, rgba(255,255,255,0.04))', borderColor: 'var(--glass-border, rgba(255,255,255,0.08))', color: 'var(--text-secondary)' }}
              onClick={() => setShareModalOpen(true)}
            >
              分享
            </button>
          </div>
        </div>
      </header>

      {/* 主体 */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 左侧边栏 */}
        {!isMobile && (
          <ScriptSideNav
            activeNav={activeNav}
            onNavChange={(nav) => {
              setActiveNav(nav);
              if (nav === 'work-info') setIsEpisodeEditorOpen(false);
            }}
            selectedEpisode={selectedEpisode}
            onEpisodeSelect={(ep) => {
              setSelectedEpisode(ep);
              setIsEpisodeEditorOpen(true);
            }}
            episodes={episodeList}
            onAddEpisode={handleAddEpisode}
          />
        )}

        {/* 主编辑区 */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {!isEpisodeEditorOpen && activeNav === 'tags' && <TagsManager />}
          {!isEpisodeEditorOpen && activeNav === 'outline' && <ChapterOutline volumes={[]} />}
          {!isEpisodeEditorOpen && activeNav === 'characters' && <ScriptCharacters />}
          {!isEpisodeEditorOpen && activeNav === 'work-info' && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col [&>*]:flex-1 [&>*]:min-h-0">
              <WorkInfoManager
                workId={workId}
                workData={work ? { metadata: { ...(work.metadata || {}) } } as WorkData : undefined}
              />
            </div>
          )}
          {isEpisodeEditorOpen && selectedEpisode !== null && (
            <ScriptEditor editor={editor} />
          )}
        </div>

        {/* 右侧：协作AI面板 */}
        {!isMobile && workId && (
          <CollabAIPanel
            workId={workId}
            chapters={episodeList.map((ep) => ({
              id: ep.id,
              title: ep.title,
            }))}
            currentChapterId={currentChapterId}
          />
        )}
        {!isMobile && !workId && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3" style={{ width: 280, color: 'var(--text-tertiary)' }}>
            <p className="text-sm m-0">请先创建剧本以使用协作功能</p>
          </div>
        )}
      </div>

      <ShareWorkModal
        isOpen={shareModalOpen}
        workId={workId || ''}
        workTitle={scriptName}
        editorPath="/script/editor"
        onClose={() => setShareModalOpen(false)}
      />
    </div>
  );
}
