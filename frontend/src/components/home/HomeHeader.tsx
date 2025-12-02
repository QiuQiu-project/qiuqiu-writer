import { Bell, User, Coins } from 'lucide-react';
import './HomeHeader.css';

export default function HomeHeader() {
  return (
    <header className="home-header">
      <div className="header-left">
        <span className="greeting">Hi, 蛙蛙tL2L3z</span>
        <span className="welcome-text">欢迎来到蛙蛙写作!</span>
      </div>
      
      <div className="header-center">
        <button className="competition-btn">
          AI工具大赛第五期
        </button>
      </div>
      
      <div className="header-right">
        <button className="invite-btn">
          <span>邀请赚现金</span>
          <span className="go-tag">GO</span>
        </button>
        <div className="coin-display">
          <Coins size={18} />
          <span className="coin-amount">514 +</span>
        </div>
        <span className="member-hint">开会员得蛙币</span>
        <button className="icon-btn">
          <Bell size={20} />
        </button>
        <button className="icon-btn user-avatar">
          <User size={20} />
        </button>
      </div>
    </header>
  );
}

