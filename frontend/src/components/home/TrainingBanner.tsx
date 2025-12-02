import { Play, Coins } from 'lucide-react';
import './TrainingBanner.css';

export default function TrainingBanner() {
  return (
    <div className="training-banner">
      <div className="banner-content">
        <div className="banner-text">
          <h2 className="banner-title">「阁主X蛙蛙」 写作训练营</h2>
          <p className="banner-subtitle">【阁主】品质保证,长篇、短篇、短剧全面开营!</p>
        </div>
        <button className="banner-btn">
          立即查看
        </button>
      </div>
      <div className="banner-illustration">
        <div className="tv-screen">
          <Play size={40} className="play-icon" />
        </div>
        <div className="floating-coins">
          <Coins size={24} className="coin-1" />
          <div className="bill">100</div>
        </div>
      </div>
    </div>
  );
}

