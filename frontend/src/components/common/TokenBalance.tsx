import { useEffect, useState } from 'react';
import { tokenApi, type TokenInfo } from '../../utils/tokenApi';
import './TokenBalance.css';

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
        className="token-balance"
        onClick={handleClick}
        title="点击升级套餐"
        type="button"
      >
        <span className="token-balance__icon">⚡</span>
        <span className="token-balance__text">...</span>
      </button>
    );
  }

  // token_total 由后端动态计算（含套餐配置），直接使用
  const pct = info.token_total > 0 ? info.token_remaining / info.token_total : 1;
  const isWarning = pct < 0.1;

  return (
    <button
      className={`token-balance${isWarning ? ' token-balance--warning' : ''}`}
      onClick={handleClick}
      title={`剩余 ${info.token_remaining.toLocaleString()} tokens，点击升级套餐`}
      type="button"
    >
      <span className="token-balance__icon">⚡</span>
      <span className="token-balance__text">升级套餐</span>
    </button>
  );
}
