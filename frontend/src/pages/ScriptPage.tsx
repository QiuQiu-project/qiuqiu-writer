import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Upload, FileText, ChevronLeft, ChevronRight, ChevronDown, Search } from 'lucide-react';
import { worksApi } from '../utils/worksApi';
import { chaptersApi } from '../utils/chaptersApi';

export default function ScriptPage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const currentPage = 1;

  const handleNewScript = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const work = await worksApi.createWork({ title: '新剧本', work_type: 'script' });
      await chaptersApi.createChapter({
        work_id: work.id,
        title: '第1集',
        chapter_number: 1,
      });
      navigate(`/script/editor?workId=${work.id}`);
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="w-full min-h-full p-6 max-md:p-4" style={{ background: 'var(--bg-primary)' }}>
      {/* 新的创作 */}
      <section className="mb-8">
        <div className="mb-5">
          <h1 className="text-2xl font-bold m-0 max-md:text-xl" style={{ color: 'var(--text-primary)' }}>
            新的创作
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-5 mb-8 max-lg:grid-cols-2 max-md:grid-cols-1">
          {/* 新建空白剧本 */}
          <div
            className={`relative border rounded-[var(--radius-lg,12px)] p-6 cursor-pointer transition-all overflow-hidden hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:[border-color:var(--accent-primary)]${creating ? ' opacity-70 pointer-events-none' : ''}`}
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--accent-primary)' }}
            onClick={handleNewScript}
          >
            <div className="relative w-16 h-16 mb-4">
              <div
                className="absolute w-full h-full rounded-[var(--radius-sm,6px)] opacity-10"
                style={{ background: 'var(--accent-primary)' }}
              />
              <div
                className="absolute w-full h-full flex items-center justify-center rounded-[var(--radius-sm,6px)] text-white"
                style={{ background: 'var(--accent-primary)' }}
              >
                <Plus size={32} strokeWidth={3} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2 m-0" style={{ color: 'var(--text-primary)' }}>
                新建空白剧本
              </h2>
              <p className="text-sm leading-[1.5] m-0" style={{ color: 'var(--text-secondary)' }}>
                从0开始创建你的原创剧本
              </p>
            </div>
          </div>

          {/* 星球小说改编剧本 */}
          <div
            className="relative border rounded-[var(--radius-lg,12px)] p-6 cursor-pointer transition-all overflow-hidden hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:[border-color:var(--accent-primary)]"
            style={{ background: 'var(--bg-primary)', borderColor: '#cccccc' }}
          >
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute w-full h-full rounded-[var(--radius-sm,6px)] bg-[#cccccc] opacity-10" />
              <div className="absolute w-full h-full flex items-center justify-center rounded-[var(--radius-sm,6px)] bg-[#fce7f3] text-[#cccccc]">
                <FileText size={28} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2 m-0" style={{ color: 'var(--text-primary)' }}>
                星球小说改编剧本
              </h2>
              <p className="text-sm leading-[1.5] m-0" style={{ color: 'var(--text-secondary)' }}>
                星球小说一键转动态漫、沙雕漫、简笔画
              </p>
            </div>
          </div>

          {/* 本地上传改编剧本 */}
          <div
            className="relative border rounded-[var(--radius-lg,12px)] p-6 cursor-pointer transition-all overflow-hidden hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] hover:[border-color:var(--accent-primary)]"
            style={{ background: 'var(--bg-primary)', borderColor: '#999999' }}
          >
            <div className="relative w-16 h-16 mb-4">
              <div className="absolute w-full h-full rounded-[var(--radius-sm,6px)] bg-[#999999] opacity-10" />
              <div className="absolute w-full h-full flex items-center justify-center rounded-[var(--radius-sm,6px)] bg-[#dbeafe] text-[#999999]">
                <Upload size={28} />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2 m-0" style={{ color: 'var(--text-primary)' }}>
                本地上传改编剧本
              </h2>
              <p className="text-sm leading-[1.5] m-0" style={{ color: 'var(--text-secondary)' }}>
                支持txt和word,一次最多上传10个本地小说
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 改编记录 */}
      <section className="mb-8">
        <div className="mb-5">
          <h2 className="text-lg font-semibold m-0" style={{ color: 'var(--text-primary)' }}>改编记录</h2>
        </div>
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-4 p-12">
            <div
              className="relative w-[120px] h-[120px] flex items-center justify-center rounded-full"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-tertiary)' }}
            >
              <span
                className="absolute inset-0 rounded-full opacity-30"
                style={{ background: 'radial-gradient(circle, var(--accent-light) 0%, transparent 70%)' }}
              />
              <Search size={48} className="relative z-[1]" />
            </div>
            <p className="text-base m-0" style={{ color: 'var(--text-tertiary)' }}>暂无改编记录</p>
          </div>
        </div>
      </section>

      {/* 分页控件 */}
      <div className="flex items-center justify-end gap-2 mt-8 pt-6 border-t" style={{ borderColor: 'var(--border-light)' }}>
        <button
          className="flex items-center justify-center w-8 h-8 p-0 border rounded-[var(--radius-sm,6px)] cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:[border-color:var(--accent-primary)] hover:[color:var(--accent-primary)] hover:[background:var(--accent-light)]"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
          disabled={currentPage === 1}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="flex items-center justify-center min-w-8 h-8 px-3 border text-sm font-medium rounded-[var(--radius-sm,6px)] cursor-pointer transition-all text-white hover:[background:var(--accent-hover)] hover:[border-color:var(--accent-hover)]"
          style={{ background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)' }}
        >
          1
        </button>
        <button
          className="flex items-center justify-center w-8 h-8 p-0 border rounded-[var(--radius-sm,6px)] cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:[border-color:var(--accent-primary)] hover:[color:var(--accent-primary)] hover:[background:var(--accent-light)]"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', color: 'var(--text-secondary)' }}
          disabled
        >
          <ChevronRight size={16} />
        </button>
        <div
          className="flex items-center gap-1 ml-4 px-3 py-1.5 text-sm cursor-pointer rounded-[var(--radius-sm,6px)] transition-all hover:[background:var(--bg-secondary)] hover:[color:var(--text-primary)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>5条/页</span>
          <ChevronDown size={14} />
        </div>
      </div>
    </div>
  );
}
