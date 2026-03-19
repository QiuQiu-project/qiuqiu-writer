import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { tokenApi, paymentApi, tokensToDisplay, type TokenInfo, type PlanConfig } from '../utils/tokenApi';
import './PlansPage.css';

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
type PayMethod = 'wechat' | 'alipay';

const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly'];
const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: '月付',
  quarterly: '季付',
  yearly: '年付',
};

const PLAN_THEMES = [
  { bg: 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)', accent: '#5c6bc0', icon: '🌱', btnClass: 'plan-btn--gray' },
  { bg: 'linear-gradient(135deg,#ede7f6 0%,#b39ddb 100%)', accent: '#7c3aed', icon: '⭐', btnClass: 'plan-btn--purple' },
  { bg: 'linear-gradient(135deg,#fff8e1 0%,#ffcc80 100%)', accent: '#d97706', icon: '👑', btnClass: 'plan-btn--gold' },
  { bg: 'linear-gradient(135deg,#e3f2fd 0%,#90caf9 100%)', accent: '#1565c0', icon: '💎', btnClass: 'plan-btn--blue' },
];

function calcSaving(plan: PlanConfig, cycle: BillingCycle): string | null {
  if (cycle === 'monthly') return null;
  const monthlyPrice = plan.pricing?.monthly?.current;
  const cyclePrice = plan.pricing?.[cycle]?.current;
  if (!monthlyPrice || !cyclePrice || monthlyPrice === 0) return null;
  const months = cycle === 'quarterly' ? 3 : 12;
  const saving = Math.round(monthlyPrice * months - cyclePrice);
  return saving > 0 ? `省¥${saving}` : null;
}

export default function PlansPage() {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [payTarget, setPayTarget] = useState<{ plan: PlanConfig; themeIndex: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      tokenApi.getTokenInfo().catch(() => null),
      tokenApi.getPlanConfigs().catch(() => [])
    ]).then(([info, p]) => {
      if (info) setTokenInfo(info);
      if (p) setPlans(p);
      setLoading(false);
    });
  }, []);

  const firstPaid = plans.find((p) => (p.pricing?.monthly?.current ?? 0) > 0);
  const currentPlanConfig = tokenInfo ? plans.find(p => p.key === tokenInfo.plan) : null;

  if (loading) {
    return <div className="page-container" style={{ padding: '40px', textAlign: 'center' }}>加载中...</div>;
  }

  return (
    <div className="plans-page">
      {/* 头部信息区 */}
      <div className="plans-header">
        <h1 className="plans-title">我的套餐</h1>
        <div className="plans-current-info">
          <div className="info-card">
            <span className="info-label">当前套餐</span>
            <span className="info-value plan-badge">{currentPlanConfig?.label || tokenInfo?.plan || '免费版'}</span>
          </div>
          <div className="info-card">
            <span className="info-label">剩余额度</span>
            <span className="info-value quota-value">{tokenInfo ? tokensToDisplay(tokenInfo.token_remaining) : '-'}</span>
          </div>
          {tokenInfo?.plan_expires_at && (
            <div className="info-card">
              <span className="info-label">到期时间</span>
              <span className="info-value">{new Date(tokenInfo.plan_expires_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="plans-content">
        {payTarget ? (
          <PaymentPanel
            plan={payTarget.plan}
            cycle={cycle}
            themeIndex={payTarget.themeIndex}
            onBack={() => setPayTarget(null)}
            onClose={() => {
              setPayTarget(null);
              // 支付成功后刷新信息
              tokenApi.getTokenInfo().then(setTokenInfo);
            }}
          />
        ) : (
          <>
            <div className="plans-tabs-wrap">
              <h2 className="plans-section-title">升级套餐，解锁无限创作</h2>
              <div className="plans-tabs">
                {BILLING_CYCLES.map((c) => {
                  const saving = firstPaid ? calcSaving(firstPaid, c) : null;
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`plans-tab ${cycle === c ? 'active' : ''}`}
                      onClick={() => setCycle(c)}
                    >
                      {BILLING_LABELS[c]}
                      {saving && <span className="plans-tab-saving">{saving}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="plans-grid">
              {plans.map((plan, i) => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  cycle={cycle}
                  isCurrent={plan.key === tokenInfo?.plan}
                  themeIndex={i}
                  onUpgrade={() => setPayTarget({ plan, themeIndex: i })}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlanCard({
  plan, cycle, isCurrent, themeIndex, onUpgrade,
}: {
  plan: PlanConfig;
  cycle: BillingCycle;
  isCurrent: boolean;
  themeIndex: number;
  onUpgrade: () => void;
}) {
  const price = plan.pricing?.[cycle];
  const isFree = !price || (price.original === 0 && price.current === 0);
  const hasDiscount = price && price.original > price.current;
  const theme = PLAN_THEMES[themeIndex % PLAN_THEMES.length];

  return (
    <div
      className={`plan-card ${plan.highlight ? 'highlight' : ''} ${isCurrent ? 'current' : ''}`}
      style={{ '--plan-accent': theme.accent } as React.CSSProperties}
    >
      {plan.badge && <div className="plan-badge-tag" style={{ background: theme.accent }}>{plan.badge}</div>}
      <div className="plan-hero" style={{ background: theme.bg }}>
        <span className="plan-hero-icon">{theme.icon}</span>
        <div className="plan-name">{plan.label}</div>
      </div>
      <div className="plan-body">
        <div className="plan-pricing">
          {isFree ? (
            <div className="plan-price-free">免费</div>
          ) : (
            <>
              {hasDiscount && <div className="plan-price-original">原价 ¥{price!.original}</div>}
              <div className="plan-price-row">
                <span className="plan-price-currency" style={{ color: theme.accent }}>¥</span>
                <span className="plan-price-amount" style={{ color: theme.accent }}>{price!.current}</span>
                <span className="plan-price-unit">/{BILLING_LABELS[cycle]}</span>
              </div>
            </>
          )}
        </div>
        <div className="plan-divider" />
        <div className="plan-feature">
          <span className="plan-feature-dot" style={{ background: theme.accent }} />
          每月可写 <strong>{tokensToDisplay(plan.tokens)}</strong>
        </div>
        {plan.desc && (
          <div className="plan-feature">
            <span className="plan-feature-dot" style={{ background: theme.accent }} />
            {plan.desc}
          </div>
        )}
        <button
          className={`plan-btn ${theme.btnClass}`}
          style={plan.highlight ? { background: theme.accent, borderColor: theme.accent } : {}}
          onClick={isFree ? undefined : onUpgrade}
          type="button"
          disabled={isCurrent}
        >
          {isCurrent ? '当前套餐' : isFree ? '免费使用' : '立即升级'}
        </button>
      </div>
    </div>
  );
}

function PaymentPanel({ plan, cycle, themeIndex, onBack, onClose }: { plan: PlanConfig, cycle: BillingCycle, themeIndex: number, onBack: () => void, onClose: () => void }) {
  const [method, setMethod] = useState<PayMethod>('wechat');
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const price = plan.pricing?.[cycle];
  const theme = PLAN_THEMES[themeIndex % PLAN_THEMES.length];
  const amount = price?.current ?? 0;

  const createOrder = async (payMethod: PayMethod) => {
    setLoading(true);
    setError(null);
    setQrUrl(null);
    setOrderId(null);
    if (pollRef.current) clearInterval(pollRef.current);

    try {
      const res = await paymentApi.createOrder(plan.key, cycle, payMethod);
      setOrderId(res.order_id);
      setQrUrl(res.qr_url);
      setIsMock(res.is_mock);
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await paymentApi.getOrderStatus(res.order_id);
          if (statusRes.status === 'paid') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPaid(true);
          }
        } catch {
          // polling 过程中偶发失败可忽略（下次轮询会重试）
        }
      }, 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '下单失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleMethodChange = (m: PayMethod) => {
    setMethod(m);
    createOrder(m);
  };

  useEffect(() => {
    createOrder(method);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (paid) {
    return (
      <div className="payment-success">
        <div className="success-icon">🎉</div>
        <h3 className="success-title">支付成功！</h3>
        <p className="success-desc">{plan.label} 套餐已激活，尽情创作吧</p>
        <button className="success-btn" onClick={onClose} type="button">返回我的套餐</button>
      </div>
    );
  }

  return (
    <div className="payment-panel">
      <button className="payment-back" onClick={onBack} type="button">← 返回套餐选择</button>
      <div className="payment-content-wrapper">
        <div className="payment-order">
          <div className="payment-order-icon" style={{ background: theme.bg }}>{theme.icon}</div>
          <div className="payment-order-info">
            <div className="payment-order-name">{plan.label} · {BILLING_LABELS[cycle]}</div>
            <div className="payment-order-desc">{plan.desc}</div>
          </div>
          <div className="payment-order-price" style={{ color: theme.accent }}>¥{amount}</div>
        </div>

        <div className="payment-methods">
          <button
            type="button"
            className={`method-btn method-wechat ${method === 'wechat' ? 'active' : ''}`}
            onClick={() => handleMethodChange('wechat')}
          >
            <span className="method-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M9.5 2C5.36 2 2 4.91 2 8.5c0 2.02 1.06 3.82 2.72 5.02L4 16l2.5-1.25C7.26 14.9 8.35 15 9.5 15c.17 0 .34 0 .5-.01A5.99 5.99 0 0 0 10 14c0-3.31 2.91-6 6.5-6 .17 0 .34 0 .5.01C16.07 4.57 13.08 2 9.5 2z" fill="#07c160"/>
                <path d="M16.5 10C13.46 10 11 12.01 11 14.5c0 1.38.72 2.61 1.85 3.45L12.5 20l2-1c.62.17 1.28.25 1.98.25.09 0 .17 0 .26-.01A4.36 4.36 0 0 0 17 19c2.76 0 5-1.79 5-4s-2.24-5-5.5-5z" fill="#07c160" opacity=".85"/>
              </svg>
            </span>
            微信支付
            {method === 'wechat' && <span className="method-check">✓</span>}
          </button>
          <button
            type="button"
            className={`method-btn method-alipay ${method === 'alipay' ? 'active' : ''}`}
            onClick={() => handleMethodChange('alipay')}
          >
            <span className="method-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="5" fill="#1677FF"/>
                <path d="M20 15.3c-1.9-.8-4.5-2-6.4-3 .5-1 .9-2.3 1-3.8H17V7h-4.5V5.5h-2V7H6v1.5h8.1c-.1 1-.4 1.9-.7 2.7-1.6-.8-2.9-1.3-3.9-1.3-2 0-3.4 1.2-3.4 2.9 0 1.8 1.5 3 3.7 3 1.6 0 3.1-.7 4.3-1.9 1.6.9 3.8 2 5.9 2.8V15.3z" fill="white"/>
                <path d="M9.5 13.3c-1 0-1.7-.5-1.7-1.3 0-.7.6-1.3 1.7-1.3.8 0 1.8.4 3 1.1-.9.9-1.9 1.5-3 1.5z" fill="#1677FF"/>
              </svg>
            </span>
            支付宝
            {method === 'alipay' && <span className="method-check">✓</span>}
          </button>
        </div>

        <div className="payment-qr-wrap">
          <div className="payment-qr-box">
            {loading && <div className="payment-loading">生成中…</div>}
            {error && (
              <div className="payment-error">
                <div>⚠️ {error}</div>
                <button type="button" onClick={() => createOrder(method)}>重试</button>
              </div>
            )}
            {!loading && !error && qrUrl && (
              <QRCodeSVG value={qrUrl} size={180} fgColor={method === 'wechat' ? '#07c160' : '#1677ff'} level="M" />
            )}
          </div>
          <div className="payment-qr-tip">
            {method === 'wechat' ? '打开微信，扫一扫完成支付' : '打开支付宝，扫一扫完成支付'}
          </div>
          <div className="payment-amount-big" style={{ color: theme.accent }}>¥{amount}</div>
          {orderId && <div className="payment-order-id">订单号：{orderId}</div>}
        </div>

        <div className="payment-footer">
          {isMock ? (
            <button
              className="payment-paid-btn mock-btn"
              onClick={async () => {
                if (!orderId) return;
                await fetch(`/api/v1/payment/mock-pay/${orderId}`);
                setPaid(true);
              }}
              type="button"
            >
              🧪 模拟支付（开发测试）
            </button>
          ) : (
            <button
              className="payment-paid-btn"
              disabled={checking}
              onClick={async () => {
                if (!orderId) return;
                setChecking(true);
                setCheckMsg(null);
                try {
                  const r = await paymentApi.getOrderStatus(orderId);
                  if (r.status === 'paid') setPaid(true);
                  else setCheckMsg('未检测到支付，请完成扫码支付后再试');
                } catch {
                  setCheckMsg('查询失败，请稍后再试');
                } finally {
                  setChecking(false);
                }
              }}
              type="button"
            >
              {checking ? '查询中…' : '我已完成支付'}
            </button>
          )}
          {checkMsg && <div className="payment-check-msg">{checkMsg}</div>}
          <div className="payment-secure">🔒 支付安全加密 · 支持随时退订</div>
        </div>
      </div>
    </div>
  );
}
