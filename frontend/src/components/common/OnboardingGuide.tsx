import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import './OnboardingGuide.css';

interface OnboardingGuideProps {
  onStart: () => void;
  onSkip: () => void;
  workId: string;
}

const STORAGE_KEY_PREFIX = 'wawawriter_onboarding_';

export default function OnboardingGuide({ onStart, onSkip, workId }: OnboardingGuideProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if we've already shown the guide for this work
    const timer = setTimeout(() => {
      const hasShown = localStorage.getItem(`${STORAGE_KEY_PREFIX}${workId}`);
      if (!hasShown) {
        setIsVisible(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [workId]);

  const handleStart = () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${workId}`, 'true');
    setIsVisible(false);
    onStart();
  };

  const handleSkip = () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${workId}`, 'true');
    setIsVisible(false);
    onSkip();
  };

  if (!isVisible) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-icon">
          <BookOpen size={32} />
        </div>
        <h2 className="onboarding-title">欢迎使用作品编辑器</h2>
        <p className="onboarding-description">
          为了让 AI 更好地理解您的创作意图并提供精准的辅助，建议您首先完善作品的基本信息、世界观设定和角色信息。
        </p>
        <div className="onboarding-actions">
          <button className="onboarding-btn onboarding-btn-secondary" onClick={handleSkip}>
            稍后填写
          </button>
          <button className="onboarding-btn onboarding-btn-primary" onClick={handleStart}>
            前往填写作品信息
          </button>
        </div>
      </div>
    </div>
  );
}
