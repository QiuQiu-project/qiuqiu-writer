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
  Check
} from 'lucide-react';
import { authApi } from '../utils/authApi';
import { worksApi } from '../utils/worksApi';
import MessageModal from '../components/common/MessageModal';
import type { MessageType } from '../components/common/MessageModal';
import './HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const isAuthenticated = authApi.isAuthenticated();
  const [creating, setCreating] = useState(false);

  // 消息提示状态
  const [messageState, setMessageState] = useState<{
    isOpen: boolean;
    type: MessageType;
    message: string;
    title?: string;
    onConfirm?: () => void;
  }>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const showMessage = (message: string, type: MessageType = 'info', title?: string, onConfirm?: () => void) => {
    setMessageState({
      isOpen: true,
      type,
      message,
      title,
      onConfirm,
    });
  };

  const closeMessage = () => {
    setMessageState(prev => ({ ...prev, isOpen: false }));
  };

  const features = [
    {
      icon: <PenTool size={24} />,
      title: '智能写作助手',
      description: 'AI驱动的创作助手，帮你突破写作瓶颈，激发创作灵感',
    },
    {
      icon: <FileText size={24} />,
      title: '多格式支持',
      description: '强大的创作工具，支持各种写作需求，让创作更自由',
    },
    {
      icon: <Users size={24} />,
      title: '协作创作',
      description: '多人实时协作，共同完成作品，让创作更有趣',
    },
    {
      icon: <Cloud size={24} />,
      title: '云端同步',
      description: '自动保存，多设备同步，随时随地继续创作',
    },
    {
      icon: <Zap size={24} />,
      title: '实时编辑',
      description: '流畅的编辑体验，支持富文本和Markdown格式',
    },
    {
      icon: <Shield size={24} />,
      title: '安全可靠',
      description: '数据加密存储，多重备份，保障你的创作安全',
    },
  ];

  const handleGetStarted = async () => {
    if (!isAuthenticated) {
      // 未登录时，可以打开登录弹窗或跳转到登录页
      navigate('/');
      return;
    }

    setCreating(true);
    try {
      // 获取作品列表，按更新时间排序，获取最近编辑的作品
      const response = await worksApi.listWorks({
        page: 1,
        size: 1,
        sort_by: 'updated_at',
        sort_order: 'desc'
      });

      if (response.works && response.works.length > 0) {
        // 有作品，打开最近编辑的作品
        const latestWork = response.works[0];
        console.log('📖 [HomePage.handleGetStarted] 打开最近编辑的作品:', latestWork);
        navigate(`/novel/editor?workId=${latestWork.id}`);
      } else {
        // 没有作品，创建新作品
        console.log('📝 [HomePage.handleGetStarted] 没有作品，开始创建新作品...');
        
        const workData = {
          title: '未命名作品',
          work_type: 'long' as const,
          is_public: false,
        };
        
        const newWork = await worksApi.createWork(workData);
        
        console.log('✅ [HomePage.handleGetStarted] 作品创建成功:', newWork);
        
        if (!newWork || !newWork.id) {
          throw new Error('创建作品成功，但未返回作品ID');
        }
        
        // 跳转到编辑器
        navigate(`/novel/editor?workId=${newWork.id}`);
      }
    } catch (err) {
      console.error('❌ [HomePage.handleGetStarted] 操作失败:', err);
      const errorMessage = err instanceof Error ? err.message : '操作失败';
      showMessage(`操作失败: ${errorMessage}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={16} />
            <span>AI驱动的智能写作平台</span>
          </div>
          <h1 className="hero-title">
            球球写作
            <span className="hero-subtitle">让创作更简单，让故事更精彩</span>
          </h1>
          <p className="hero-description">
            专业的AI写作助手，帮助你从灵感到成稿，轻松完成每一部作品。
            无论你想写什么，球球写作都是你最好的创作伙伴。
          </p>
          <div className="hero-actions">
            <button 
              className="btn-primary"
              onClick={handleGetStarted}
              disabled={creating}
            >
              {creating ? '加载中...' : '开始创作'}
              {!creating && <ArrowRight size={18} />}
            </button>
            {!isAuthenticated && (
              <button 
                className="btn-secondary"
                onClick={() => navigate('/')}
              >
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
            <h2 className="section-title">为什么选择球球写作？</h2>
            <p className="section-description">
              我们提供全方位的创作支持，让你的创作之旅更加顺畅
            </p>
          </div>
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">
                  {feature.icon}
                </div>
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
            <h2 className="section-title">适用场景</h2>
            <p className="section-description">
              无论你是专业作家还是写作爱好者，球球写作都能满足你的需求
            </p>
          </div>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <BookOpen size={32} className="use-case-icon" />
              <h3 className="use-case-title">创作管理</h3>
              <ul className="use-case-list">
                <li><Check size={16} /> 章节结构管理</li>
                <li><Check size={16} /> 角色关系梳理</li>
                <li><Check size={16} /> 情节大纲规划</li>
                <li><Check size={16} /> 自动保存功能</li>
              </ul>
            </div>
            <div className="use-case-card">
              <FileText size={32} className="use-case-icon" />
              <h3 className="use-case-title">内容编辑</h3>
              <ul className="use-case-list">
                <li><Check size={16} /> 富文本编辑</li>
                <li><Check size={16} /> Markdown支持</li>
                <li><Check size={16} /> 实时预览</li>
                <li><Check size={16} /> 格式自动调整</li>
              </ul>
            </div>
            <div className="use-case-card">
              <Users size={32} className="use-case-icon" />
              <h3 className="use-case-title">团队协作</h3>
              <ul className="use-case-list">
                <li><Check size={16} /> 多人实时编辑</li>
                <li><Check size={16} /> 版本历史管理</li>
                <li><Check size={16} /> 评论批注功能</li>
                <li><Check size={16} /> 权限精细控制</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <MessageModal
        isOpen={messageState.isOpen}
        onClose={closeMessage}
        title={messageState.title}
        message={messageState.message}
        type={messageState.type}
        onConfirm={() => {
          closeMessage();
          if (messageState.onConfirm) messageState.onConfirm();
        }}
      />
    </div>
  );
}
