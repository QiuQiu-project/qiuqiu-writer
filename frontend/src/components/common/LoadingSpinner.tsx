import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  message?: string;
}

export default function LoadingSpinner({
  size = 'md',
  fullScreen = false,
  message,
}: LoadingSpinnerProps) {
  const containerClass = fullScreen
    ? 'flex flex-col justify-center items-center min-h-screen bg-background gap-4'
    : 'flex flex-col justify-center items-center p-8 gap-4';

  const spinnerSizeClass = {
    sm: 'w-6 h-6 border-[3px]',
    md: 'w-10 h-10 border-4',
    lg: 'w-[60px] h-[60px] border-[5px]',
  }[size];

  return (
    <div className={containerClass}>
      <div
        className={cn(
          'rounded-full border-border animate-spin',
          spinnerSizeClass
        )}
        style={{ borderTopColor: 'var(--accent-primary)' }}
      />
      {message && (
        <div className="text-muted-foreground text-sm text-center">{message}</div>
      )}
    </div>
  );
}
