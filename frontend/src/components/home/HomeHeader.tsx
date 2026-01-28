import './HomeHeader.css';

export default function HomeHeader() {
  return (
    <header className="home-header">
      <div className="header-left">
        <span className="greeting">Hi, 星球tL2L3z</span>
        <span className="welcome-text">欢迎来到星球写作!</span>
      </div>
      
      <div className="header-center">
        <button className="competition-btn">
          AI工具大赛第五期
        </button>
      </div>
      
    </header>
  );
}

