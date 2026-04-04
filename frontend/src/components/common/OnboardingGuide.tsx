import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import DraggableResizableModal from './DraggableResizableModal';

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
    window.dispatchEvent(new CustomEvent('wawawriter_onboarding_finished', { detail: { workId } }));
    onStart();
  };

  const handleSkip = () => {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${workId}`, 'true');
    setIsVisible(false);
    window.dispatchEvent(new CustomEvent('wawawriter_onboarding_finished', { detail: { workId } }));
    onSkip();
  };

  return (
    <DraggableResizableModal
      isOpen={isVisible}
      onClose={handleSkip}
      title="欢迎使用作品编辑器"
      initialWidth={460}
      initialHeight={340}
      minWidth={360}
      minHeight={300}
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BookOpen size={24} />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground">欢迎使用作品编辑器</h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            为了让 AI 更好地理解您的创作意图并提供精准的辅助，建议您首先完善作品的基本信息、世界观设定和角色信息。
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="rounded-xl border border-border px-5 py-2 text-sm font-medium text-foreground hover:bg-muted"
            onClick={handleSkip}
          >
            稍后填写
          </button>
          <button
            className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={handleStart}
          >
            前往填写作品信息
          </button>
        </div>
      </div>
    </DraggableResizableModal>
  );
}
