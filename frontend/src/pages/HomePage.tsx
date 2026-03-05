import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Sparkles,
  Users,
  Zap,
  Shield,
  Cloud,
  PenTool,
  FileText,
  ArrowRight,
  Check,
} from 'lucide-react';
import { authApi } from '../utils/authApi';
import { worksApi } from '../utils/worksApi';
import MessageModal from '../components/common/MessageModal';
import type { MessageType } from '../components/common/MessageModal';
import { parseError } from '../utils/errorUtils';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const isAuthenticated = authApi.isAuthenticated();
  const [creating, setCreating] = useState(false);

  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
    toast?: boolean;
    autoCloseMs?: number;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({ isOpen: true, type, message, title, onConfirm });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  const features = [
    {
      icon: <PenTool size={22} />,
      title: '智能写作助手',
      description: 'AI 驱动的创作助手，帮你突破写作瓶颈，随时激发创作灵感',
    },
    {
      icon: <FileText size={22} />,
      title: '多格式支持',
      description: '强大的编辑工具，支持长篇小说、剧本、短篇等各类写作需求',
    },
    {
      icon: <Users size={22} />,
      title: '协作创作',
      description: '多人实时协作编辑，共同完成作品，让创作充满乐趣',
    },
    {
      icon: <Cloud size={22} />,
      title: '云端同步',
      description: '自动保存，多设备无缝同步，随时随地继续你的创作',
    },
    {
      icon: <Zap size={22} />,
      title: '实时编辑',
      description: '流畅的富文本编辑体验，支持 Markdown，所见即所得',
    },
    {
      icon: <Shield size={22} />,
      title: '安全可靠',
      description: '数据加密存储，多重备份机制，你的作品永远安全',
    },
  ];

  const handleGetStarted = async () => {
    if (!isAuthenticated) {
      navigate('/');
      return;
    }

    setCreating(true);
    try {
      const response = await worksApi.listWorks({
        page: 1,
        size: 1,
        sort_by: 'updated_at',
        sort_order: 'desc',
      });

      if (response.works && response.works.length > 0) {
        const latestWork = response.works[0];
        navigate(`/novel/editor?workId=${latestWork.id}`);
      } else {
        const newWork = await worksApi.createWork({
          title: '未命名作品',
          work_type: 'long' as const,
          is_public: false,
        });
        if (!newWork || !newWork.id) throw new Error('创建作品成功，但未返回作品ID');
        navigate(`/novel/editor?workId=${newWork.id}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '操作失败';
      showMessage(parseError(err), 'error', '操作失败');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="landing-page">
      {/* 装饰性背景光晕 */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={13} />
            <span>AI 驱动的智能写作平台</span>
          </div>

          <h1 className="hero-title">
            <span className="hero-title-main">球球写作</span>
            <span className="hero-subtitle">让创作更简单，让故事更精彩</span>
          </h1>

          <p className="hero-description">
            专业的 AI 写作助手，帮助你从灵感到成稿，轻松完成每一部作品。
            无论你想写什么，球球写作都是你最好的创作伙伴。
          </p>

          <div className="hero-actions">
            <button
              className="btn-primary"
              onClick={handleGetStarted}
              disabled={creating}
            >
              {creating ? '加载中...' : '开始创作'}
              {!creating && <ArrowRight size={17} />}
            </button>
            {!isAuthenticated && (
              <button className="btn-secondary" onClick={() => navigate('/')}>
                了解更多
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">核心功能</span>
            <h2 className="section-title">为什么选择球球写作？</h2>
            <p className="section-description">
              我们提供全方位的创作支持，让你的创作之旅更加顺畅
            </p>
          </div>
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-description">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="use-cases-section">
        <div className="section-container">
          <div className="section-header">
            <span className="section-label">应用场景</span>
            <h2 className="section-title">适用于各类创作需求</h2>
            <p className="section-description">
              无论你是专业作家还是写作爱好者，球球写作都能满足你的需求
            </p>
          </div>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <BookOpen size={32} className="use-case-icon" />
              <h3 className="use-case-title">创作管理</h3>
              <ul className="use-case-list">
                <li><Check size={15} /> 章节结构管理</li>
                <li><Check size={15} /> 角色关系梳理</li>
                <li><Check size={15} /> 情节大纲规划</li>
                <li><Check size={15} /> 自动保存功能</li>
              </ul>
            </div>
            <div className="use-case-card">
              <FileText size={32} className="use-case-icon" />
              <h3 className="use-case-title">内容编辑</h3>
              <ul className="use-case-list">
                <li><Check size={15} /> 富文本编辑</li>
                <li><Check size={15} /> Markdown 支持</li>
                <li><Check size={15} /> 实时预览</li>
                <li><Check size={15} /> 格式自动调整</li>
              </ul>
            </div>
            <div className="use-case-card">
              <Users size={32} className="use-case-icon" />
              <h3 className="use-case-title">团队协作</h3>
              <ul className="use-case-list">
                <li><Check size={15} /> 多人实时编辑</li>
                <li><Check size={15} /> 版本历史管理</li>
                <li><Check size={15} /> 评论批注功能</li>
                <li><Check size={15} /> 权限精细控制</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="cta-section">
        <div className="cta-inner">
          <div className="cta-glow" aria-hidden="true" />
          <h2 className="cta-title">立即开启你的创作之旅</h2>
          <p className="cta-desc">加入创作者社区，用 AI 助力你的每一个故事</p>
          <button
            className="btn-primary cta-btn"
            onClick={handleGetStarted}
            disabled={creating}
          >
            {creating ? '加载中...' : '免费开始创作'}
            {!creating && <ArrowRight size={17} />}
          </button>
        </div>
      </section>

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        toast={messageState.toast}
        autoCloseMs={messageState.autoCloseMs}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
