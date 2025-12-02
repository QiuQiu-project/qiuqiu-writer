import { Coins, ChevronRight } from 'lucide-react';
import './SignInCard.css';

export default function SignInCard() {
  return (
    <div className="sign-in-card">
      <div className="card-header">
        <h3 className="card-title">签到领蛙币</h3>
        <a href="#" className="more-link">
          更多任务 <ChevronRight size={14} />
        </a>
      </div>
      <div className="sign-in-boxes">
        <div className="sign-box">
          <Coins size={20} />
          <span>+10 蛙币</span>
          <span className="box-label">签到1天</span>
        </div>
        <div className="sign-box">
          <Coins size={20} />
          <span>+10 蛙币</span>
          <span className="box-label">签到2天</span>
        </div>
        <div className="sign-box">
          <Coins size={20} />
          <span>+10 蛙币</span>
          <span className="box-label">签到3天</span>
        </div>
      </div>
      <button className="sign-in-btn">
        点击签到
      </button>
    </div>
  );
}

