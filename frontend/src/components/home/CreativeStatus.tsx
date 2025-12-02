import './CreativeStatus.css';

export default function CreativeStatus() {
  return (
    <div className="creative-status">
      <div className="status-header">
        <h3 className="status-title">创作情况</h3>
      </div>
      <div className="status-content">
        <div className="word-count-display">
          <span className="word-number">0</span>
          <span className="word-unit">万字</span>
        </div>
        <div className="progress-info">
          <span className="progress-text">超越0.0%创作者</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: '0%' }}></div>
          </div>
        </div>
        <div className="status-stats">
          <div className="stat-item">
            <span className="stat-label">累计AI使用次数</span>
            <span className="stat-value">0次</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">累计天数</span>
            <span className="stat-value">3天</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">作品数</span>
            <span className="stat-value">3篇</span>
          </div>
        </div>
      </div>
    </div>
  );
}

