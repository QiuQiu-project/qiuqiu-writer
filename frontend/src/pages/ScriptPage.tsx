import { useNavigate } from 'react-router-dom';
import { Plus, Upload, FileText, ChevronLeft, ChevronRight, ChevronDown, Search } from 'lucide-react';
import './ScriptPage.css';

export default function ScriptPage() {
  const navigate = useNavigate();
  const currentPage = 1;

  return (
    <div className="script-page">
      {/* 新的创作 */}
      <section className="script-section script-new">
        <div className="section-header">
          <h1 className="section-title">新的创作</h1>
        </div>
        <div className="script-new-cards">
          {/* 新建空白剧本 */}
          <div className="script-new-card primary" onClick={() => navigate('/script/editor')}>
            <div className="card-icon-wrapper">
              <div className="card-icon-bg primary-bg" />
              <div className="card-icon primary-icon">
                <Plus size={32} strokeWidth={3} />
              </div>
            </div>
            <div className="card-text">
              <h2>新建空白剧本</h2>
              <p>从0开始创建你的原创剧本</p>
            </div>
          </div>

          {/* 蛙蛙小说改编剧本 */}
          <div className="script-new-card secondary">
            <div className="card-icon-wrapper">
              <div className="card-icon-bg secondary-bg" />
              <div className="card-icon secondary-icon">
                <FileText size={28} />
              </div>
            </div>
            <div className="card-text">
              <h2>蛙蛙小说改编剧本</h2>
              <p>蛙蛙小说一键转动态漫、沙雕漫、简笔画</p>
            </div>
          </div>

          {/* 本地上传改编剧本 */}
          <div className="script-new-card tertiary">
            <div className="card-icon-wrapper">
              <div className="card-icon-bg tertiary-bg" />
              <div className="card-icon tertiary-icon">
                <Upload size={28} />
              </div>
            </div>
            <div className="card-text">
              <h2>本地上传改编剧本</h2>
              <p>支持txt和word,一次最多上传10个本地小说</p>
            </div>
          </div>
        </div>
      </section>

      {/* 改编记录 */}
      <section className="script-section script-records">
        <div className="section-header">
          <h2 className="section-subtitle">改编记录</h2>
        </div>
        <div className="records-content">
          <div className="empty-records">
            <div className="empty-icon">
              <Search size={48} />
            </div>
            <p className="empty-text">暂无改编记录</p>
          </div>
        </div>
      </section>

      {/* 分页控件 */}
      <div className="pagination-controls">
        <button className="pagination-btn" disabled={currentPage === 1}>
          <ChevronLeft size={16} />
        </button>
        <button className="pagination-page-btn active">
          1
        </button>
        <button className="pagination-btn" disabled>
          <ChevronRight size={16} />
        </button>
        <div className="pagination-size">
          <span>5条/页</span>
          <ChevronDown size={14} />
        </div>
      </div>
    </div>
  );
}

