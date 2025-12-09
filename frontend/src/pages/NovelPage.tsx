import './NovelPage.css';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';

export default function NovelPage() {
  const navigate = useNavigate();

  return (
    <div className="novel-page">
      {/* 新的创作 */}
      <section className="novel-section novel-new">
        <div className="section-header">
          <h1 className="section-title">小说写作</h1>
        </div>
        <div className="novel-new-cards">
          <div className="novel-new-card primary">
            <div className="card-icon-wrapper">
              <div className="card-icon-bg primary-bg" />
              <div className="card-icon primary-icon">
                <Plus size={28} />
              </div>
            </div>
            <div className="card-text">
              <h2>长篇小说</h2>
              <p>多章节小说，情节连贯长线更新</p>
            </div>
          </div>
          <div className="novel-new-card">
            <div className="card-icon-wrapper">
              <div className="card-icon-bg secondary-bg" />
              <div className="card-icon secondary-icon">
                <Plus size={28} />
              </div>
            </div>
            <div className="card-text">
              <h2>短篇小说</h2>
              <p>两万字以内的短篇故事，情节简单节奏快</p>
            </div>
          </div>
          <div 
            className="novel-new-card"
            onClick={() => navigate('/book-splitter')}
            style={{ cursor: 'pointer' }}
          >
            <div className="card-icon-wrapper">
              <div className="card-icon-bg tertiary-bg" />
              <div className="card-icon tertiary-icon">
                <Plus size={28} />
              </div>
            </div>
            <div className="card-text">
              <h2>小说拆书</h2>
              <p>提取大纲，拆解剧情，助力创作</p>
            </div>
          </div>
        </div>
      </section>

      {/* 近期作品 */}
      <section className="novel-section novel-recent">
        <div className="section-header">
          <h2 className="section-subtitle">近期作品</h2>
          <button className="link-button">
            查看更多 <ChevronRight size={14} />
          </button>
        </div>
        <div className="recent-content">
          <div className="recent-cover" />
          <div className="recent-info">
            <div className="recent-title-row">
              <span className="work-badge">长篇</span>
              <h3 className="recent-title">回响之声</h3>
            </div>
            <div className="recent-meta">
              <span>最近更新 · 第五章</span>
              <span>总章节：1卷 5章</span>
              <span>总字数：447字</span>
              <span>更新时间：2025-11-29 10:57:30</span>
            </div>
            <div className="recent-actions">
              <button className="outline-button">
                作品转换 <ChevronDown size={14} />
              </button>
              <button className="outline-button">
                更多 <ChevronDown size={14} />
              </button>
              <button 
                className="primary-button"
                onClick={() => navigate('/novel/editor')}
              >
                开始写作
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* AI 工具（小说写作） */}
      <section className="novel-section novel-tools">
        <div className="section-header">
          <h2 className="section-subtitle">AI工具（小说写作）</h2>
          <button className="link-button">
            查看更多 <ChevronRight size={14} />
          </button>
        </div>
        <div className="tools-tags">
          <span className="tag">#长篇</span>
          <span className="tag">#短篇</span>
          <span className="tag">#老梗指导</span>
          <span className="tag">#拆书</span>
          <span className="tag">#审稿</span>
          <span className="tag">#脑洞</span>
          <span className="tag">#人物设定</span>
        </div>
        <div className="tools-card">
          <div className="tools-main">
            <h3>青翼-短篇卡点后续写</h3>
            <p>根据给定的卡点和剧情走向，继续写出精彩的短篇内容。</p>
          </div>
          <button className="primary-button small">
            <Plus size={14} /> 立即使用
          </button>
        </div>
      </section>
    </div>
  );
}


