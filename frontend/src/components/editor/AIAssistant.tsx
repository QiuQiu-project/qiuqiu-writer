import { MessageSquare, Sparkles, Upload, FileText, Send, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import './AIAssistant.css';

export default function AIAssistant() {
  const [activeTab, setActiveTab] = useState<'inspiration' | 'chat'>('chat');
  const [message, setMessage] = useState('');
  const [charCount, setCharCount] = useState(0);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMessage(value);
    setCharCount(value.length);
  };

  return (
    <aside className="ai-assistant">
      <div className="assistant-tabs">
        <button
          className={`tab-button ${activeTab === 'inspiration' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspiration')}
        >
          <Sparkles size={16} />
          <span>灵感卡片</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={16} />
          <span>AI对话</span>
        </button>
      </div>

      {activeTab === 'chat' && (
        <div className="chat-content">
          <div className="chat-header">
            <div className="froggy-avatar">
              <span className="froggy-icon">🐸</span>
            </div>
            <div className="froggy-greeting">
              <p className="greeting-text">
                嗨!我是智能写作助手蛙蛙。今天想写什么故事?
              </p>
              <p className="disclaimer">内容由AI生成,仅供参考</p>
            </div>
          </div>

          <div className="chat-input-area">
            <div className="input-actions">
              <button className="input-action-btn">
                <Upload size={14} />
                <span>@上传文件</span>
              </button>
              <button className="input-action-btn">
                <FileText size={14} />
                <span>@引用内容</span>
              </button>
            </div>
            <textarea
              className="chat-input"
              placeholder="输入你的问题..."
              value={message}
              onChange={handleInputChange}
              rows={4}
            />
            <div className="input-footer">
              <span className="char-count">{charCount}/50000字</span>
              <button className="send-button">
                <Send size={16} />
                <span>发送</span>
              </button>
            </div>
          </div>

          <div className="chat-prompt">
            <p>写作遇到烦恼?试试问问蛙蛙!</p>
          </div>
        </div>
      )}

      {activeTab === 'inspiration' && (
        <div className="inspiration-content">
          <p className="placeholder-text">灵感卡片功能开发中...</p>
        </div>
      )}

      <div className="assistant-footer">
        <div className="footer-item">
          <span>灵感思考版</span>
        </div>
        <div className="footer-item">
          <span>蛙蛙默认工具</span>
          <select className="tool-select">
            <option>默认</option>
          </select>
        </div>
        <div className="footer-item">
          <span>16</span>
          <button className="up-arrow">
            <ChevronUp size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

