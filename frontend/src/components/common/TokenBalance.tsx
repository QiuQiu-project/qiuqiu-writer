import { useEffect, useState } from 'react';
import { tokenApi, type TokenInfo } from '../../utils/tokenApi';
import { cn } from '@/lib/utils';

export default function TokenBalance() {
  const [info, setInfo] = useState<TokenInfo | null>(null);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('token:quota-exceeded'));
  };

  useEffect(() => {
    let cancelled = false;
    tokenApi.getTokenInfo()
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((err) => {
        console.error('Failed to fetch token info:', err);
      });
    return () => { cancelled = true; };
  }, []);

  if (!info) {
    return (
      <button
        className="inline-flex items-center gap-1 cursor-pointer px-2 py-1 rounded-md text-[13px] font-medium text-muted-foreground bg-muted border border-border transition-[background,color] hover:bg-accent hover:text-foreground whitespace-nowrap select-none"
        onClick={handleClick}
        title="点击升级套餐"
        type="button"
      >
        <span className="text-sm leading-none">⚡</span>
        <span className="leading-none">...</span>
      </button>
    );
  }

  // token_total 由后端动态计算（含套餐配置），直接使用
  const pct = info.token_total > 0 ? info.token_remaining / info.token_total : 1;
  const isWarning = pct < 0.1;

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1 cursor-pointer px-2 py-1 rounded-md text-[13px] font-medium bg-muted border border-border transition-[background,color] whitespace-nowrap select-none',
        isWarning
          ? 'text-amber-500 border-amber-500 hover:bg-amber-500/10'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
      onClick={handleClick}
      title={`剩余 ${info.token_remaining.toLocaleString()} tokens，点击升级套餐`}
      type="button"
    >
      <span className="text-sm leading-none">⚡</span>
      <span className="leading-none">升级套餐</span>
    </button>
  );
}
