import './HomePage.css';
import TrainingBanner from '../components/home/TrainingBanner';
import CreativeStatus from '../components/home/CreativeStatus';
import WritingTools from '../components/home/WritingTools';
import AIToolPlaza from '../components/home/AIToolPlaza';
import SignInCard from '../components/home/SignInCard';
import Announcements from '../components/home/Announcements';
import CaseSharing from '../components/home/CaseSharing';
import { useIsMobile } from '../hooks/useMediaQuery';

export default function HomePage() {
  const isMobile = useIsMobile();

  return (
    <div className="home-page">
      <div className="home-main">
        <div className="home-content-left">
          <TrainingBanner />
          <CreativeStatus />
          <WritingTools />
          {/* 移动端可以隐藏 AI工具广场 */}
          {!isMobile && <AIToolPlaza />}
        </div>
        <div className="home-content-right">
          {/* 移动端隐藏签到和活动公告 */}
          {!isMobile && (
            <>
              <SignInCard />
              <Announcements />
            </>
          )}
          {/* 移动端可以隐藏案例分享 */}
          {!isMobile && <CaseSharing />}
        </div>
      </div>
    </div>
  );
}

