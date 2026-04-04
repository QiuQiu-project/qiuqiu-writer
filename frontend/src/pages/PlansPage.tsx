import React, { useEffect, useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { tokenApi, paymentApi, tokensToDisplay, type TokenInfo, type PlanConfig } from '../utils/tokenApi';

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
type PayMethod = 'wechat' | 'alipay';

const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly'];
const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: '月付',
  quarterly: '季付',
  yearly: '年付',
};

const PLAN_THEMES = [
  { bg: 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)', accent: '#5c6bc0', icon: '🌱', gradient: '' },
  { bg: 'linear-gradient(135deg,#ede7f6 0%,#b39ddb 100%)', accent: '#7c3aed', icon: '⭐', gradient: 'linear-gradient(135deg,#667eea,#764ba2)' },
  { bg: 'linear-gradient(135deg,#fff8e1 0%,#ffcc80 100%)', accent: '#d97706', icon: '👑', gradient: 'linear-gradient(135deg,#f59e0b,#d97706)' },
  { bg: 'linear-gradient(135deg,#e3f2fd 0%,#90caf9 100%)', accent: '#1565c0', icon: '💎', gradient: 'linear-gradient(135deg,#3b82f6,#1d4ed8)' },
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
    return (
      <div className="flex items-center justify-center p-10" style={{ color: 'var(--text-primary)' }}>
        加载中...
      </div>
    );
  }

  return (
    <div
      className="max-w-[1000px] mx-auto px-6 pt-10 pb-20 max-md:px-4 max-md:pt-5 max-md:pb-16"
      style={{ color: 'var(--text-primary)' }}
    >
      {/* 头部信息区 */}
      <div className="mb-10">
        <h1 className="text-[28px] font-extrabold mb-6" style={{ color: 'var(--text-primary)' }}>我的套餐</h1>
        <div
          className="flex flex-wrap gap-4 px-6 py-5 rounded-2xl border max-md:flex-col max-md:gap-3"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        >
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>当前套餐</span>
            <span className="inline-block px-2.5 py-0.5 bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white rounded-[6px] text-sm w-fit font-bold">
              {currentPlanConfig?.label || tokenInfo?.plan || '免费版'}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 min-w-[140px]">
            <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>剩余额度</span>
            <span className="text-lg font-bold text-emerald-500">
              {tokenInfo ? tokensToDisplay(tokenInfo.token_remaining) : '-'}
            </span>
          </div>
          {tokenInfo?.plan_expires_at && (
            <div className="flex flex-col gap-1.5 min-w-[140px]">
              <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>到期时间</span>
              <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                {new Date(tokenInfo.plan_expires_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className="border rounded-3xl overflow-hidden pb-8 shadow-[0_12px_40px_rgba(0,0,0,0.08)]"
        style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-color)' }}
      >
        {payTarget ? (
          <PaymentPanel
            plan={payTarget.plan}
            cycle={cycle}
            themeIndex={payTarget.themeIndex}
            onBack={() => setPayTarget(null)}
            onClose={() => {
              setPayTarget(null);
              tokenApi.getTokenInfo().then(setTokenInfo);
            }}
          />
        ) : (
          <>
            <div className="text-center px-6 pt-10 pb-5">
              <h2 className="text-[22px] font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
                升级套餐，解锁无限创作
              </h2>
              <div
                className="inline-flex gap-2 rounded-[24px] border p-1.5"
                style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
              >
                {BILLING_CYCLES.map((c) => {
                  const saving = firstPaid ? calcSaving(firstPaid, c) : null;
                  return (
                    <button
                      key={c}
                      type="button"
                      className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[18px] border-none text-[15px] font-semibold cursor-pointer transition-all hover:[color:var(--text-primary)]"
                      style={cycle === c
                        ? { background: 'var(--bg-primary)', color: 'var(--text-primary)', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }
                        : { background: 'transparent', color: 'var(--text-secondary)' }
                      }
                      onClick={() => setCycle(c)}
                    >
                      {BILLING_LABELS[c]}
                      {saving && (
                        <span className="inline-block px-2 py-0.5 rounded-[10px] text-xs font-bold bg-amber-100 text-amber-600">
                          {saving}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-5 px-10 py-5 justify-center max-md:px-5">
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
      className={`flex-1 min-w-[240px] max-w-[300px] rounded-2xl border-[1.5px] overflow-hidden flex flex-col transition-all duration-200 relative max-md:min-w-full ${isCurrent ? 'opacity-70' : 'hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)]'} ${plan.highlight ? 'shadow-[0_8px_24px_rgba(124,58,237,0.15)]' : ''}`}
      style={{
        '--plan-accent': theme.accent,
        background: 'var(--bg-primary)',
        borderColor: plan.highlight ? theme.accent : 'var(--border-color)',
      } as React.CSSProperties}
    >
      {plan.badge && (
        <div
          className="absolute top-0 right-4 text-white text-xs font-bold px-3 py-1 rounded-b-[8px] z-[2]"
          style={{ background: theme.accent }}
        >
          {plan.badge}
        </div>
      )}
      <div className="px-5 pt-[30px] pb-5 text-center flex flex-col items-center gap-3" style={{ background: theme.bg }}>
        <span className="text-[48px] leading-none [filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.1))]">{theme.icon}</span>
        <div className="text-lg font-extrabold text-[#3d3d5c]">{plan.label}</div>
      </div>

      <div className="flex-1 flex flex-col p-6">
        <div className="text-center min-h-[80px] flex flex-col items-center justify-end mb-3">
          {isFree ? (
            <div className="text-[32px] font-extrabold" style={{ color: 'var(--text-secondary)' }}>免费</div>
          ) : (
            <>
              {hasDiscount && (
                <div className="text-sm line-through opacity-60 mb-1" style={{ color: 'var(--text-secondary)' }}>
                  原价 ¥{price!.original}
                </div>
              )}
              <div className="flex items-baseline gap-0.5">
                <span className="text-[20px] font-bold" style={{ color: theme.accent }}>¥</span>
                <span className="text-[44px] font-black leading-none" style={{ color: theme.accent }}>{price!.current}</span>
                <span className="text-sm ml-1" style={{ color: 'var(--text-secondary)' }}>/{BILLING_LABELS[cycle]}</span>
              </div>
            </>
          )}
        </div>

        <div className="h-px my-4" style={{ background: 'var(--border-color)' }} />

        <div className="flex items-start gap-2.5 text-sm mb-3 leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]" style={{ background: theme.accent }} />
          每月可写 <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{tokensToDisplay(plan.tokens)}</strong>
        </div>
        {plan.desc && (
          <div className="flex items-start gap-2.5 text-sm mb-3 leading-[1.5]" style={{ color: 'var(--text-secondary)' }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[7px]" style={{ background: theme.accent }} />
            {plan.desc}
          </div>
        )}

        <button
          className="w-full py-3.5 rounded-xl border-[1.5px] text-[15px] font-bold cursor-pointer transition-all mt-5 disabled:cursor-default disabled:opacity-50 hover:not-disabled:[border-color:var(--plan-accent)] hover:not-disabled:[color:var(--plan-accent)]"
          style={theme.gradient
            ? { background: plan.highlight ? theme.accent : theme.gradient, borderColor: 'transparent', color: '#fff' }
            : { background: 'transparent', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }
          }
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

function PaymentPanel({ plan, cycle, themeIndex, onBack, onClose }: {
  plan: PlanConfig;
  cycle: BillingCycle;
  themeIndex: number;
  onBack: () => void;
  onClose: () => void;
}) {
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
      <div className="flex flex-col items-center justify-center py-20 px-10 text-center">
        <div className="text-[72px] leading-none mb-5">🎉</div>
        <h3 className="text-[28px] font-extrabold mb-3" style={{ color: 'var(--text-primary)' }}>支付成功！</h3>
        <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>{plan.label} 套餐已激活，尽情创作吧</p>
        <button
          className="px-10 py-3.5 rounded-xl border-none text-base font-bold cursor-pointer transition-opacity hover:opacity-90"
          style={{ background: 'var(--text-primary)', color: 'var(--bg-primary)' }}
          onClick={onClose}
          type="button"
        >
          返回我的套餐
        </button>
      </div>
    );
  }

  return (
    <div className="px-10 pt-8 pb-8 flex flex-col max-md:px-5 max-md:pt-6">
      <button
        className="self-start bg-none border-none text-[15px] cursor-pointer pb-5 flex items-center transition-colors hover:[color:var(--text-primary)]"
        style={{ color: 'var(--text-secondary)' }}
        onClick={onBack}
        type="button"
      >
        ← 返回套餐选择
      </button>

      <div className="max-w-[500px] mx-auto w-full">
        {/* Order summary */}
        <div
          className="flex items-center gap-4 rounded-2xl p-5 mb-6 border"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }}
        >
          <div
            className="w-14 h-14 rounded-[14px] flex items-center justify-center text-[28px] shrink-0"
            style={{ background: theme.bg }}
          >
            {theme.icon}
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
              {plan.label} · {BILLING_LABELS[cycle]}
            </div>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{plan.desc}</div>
          </div>
          <div className="text-[26px] font-extrabold shrink-0" style={{ color: theme.accent }}>¥{amount}</div>
        </div>

        {/* Payment methods */}
        <div className="flex gap-4 mb-8">
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-[14px] border-2 text-base font-semibold cursor-pointer transition-all relative hover:border-[#999]"
            style={method === 'wechat'
              ? { borderColor: '#07c160', background: '#f0faf4', color: '#07c160' }
              : { borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }
            }
            onClick={() => handleMethodChange('wechat')}
          >
            <span className="flex items-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M9.5 2C5.36 2 2 4.91 2 8.5c0 2.02 1.06 3.82 2.72 5.02L4 16l2.5-1.25C7.26 14.9 8.35 15 9.5 15c.17 0 .34 0 .5-.01A5.99 5.99 0 0 0 10 14c0-3.31 2.91-6 6.5-6 .17 0 .34 0 .5.01C16.07 4.57 13.08 2 9.5 2z" fill="#07c160"/>
                <path d="M16.5 10C13.46 10 11 12.01 11 14.5c0 1.38.72 2.61 1.85 3.45L12.5 20l2-1c.62.17 1.28.25 1.98.25.09 0 .17 0 .26-.01A4.36 4.36 0 0 0 17 19c2.76 0 5-1.79 5-4s-2.24-5-5.5-5z" fill="#07c160" opacity=".85"/>
              </svg>
            </span>
            微信支付
            {method === 'wechat' && (
              <span className="absolute top-2 right-3 text-xs font-bold" style={{ color: '#07c160' }}>✓</span>
            )}
          </button>
          <button
            type="button"
            className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-[14px] border-2 text-base font-semibold cursor-pointer transition-all relative hover:border-[#999]"
            style={method === 'alipay'
              ? { borderColor: '#1677ff', background: '#f0f6ff', color: '#1677ff' }
              : { borderColor: 'var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }
            }
            onClick={() => handleMethodChange('alipay')}
          >
            <span className="flex items-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="5" fill="#1677FF"/>
                <path d="M20 15.3c-1.9-.8-4.5-2-6.4-3 .5-1 .9-2.3 1-3.8H17V7h-4.5V5.5h-2V7H6v1.5h8.1c-.1 1-.4 1.9-.7 2.7-1.6-.8-2.9-1.3-3.9-1.3-2 0-3.4 1.2-3.4 2.9 0 1.8 1.5 3 3.7 3 1.6 0 3.1-.7 4.3-1.9 1.6.9 3.8 2 5.9 2.8V15.3z" fill="white"/>
                <path d="M9.5 13.3c-1 0-1.7-.5-1.7-1.3 0-.7.6-1.3 1.7-1.3.8 0 1.8.4 3 1.1-.9.9-1.9 1.5-3 1.5z" fill="#1677FF"/>
              </svg>
            </span>
            支付宝
            {method === 'alipay' && (
              <span className="absolute top-2 right-3 text-xs font-bold" style={{ color: '#1677ff' }}>✓</span>
            )}
          </button>
        </div>

        {/* QR Code */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="relative p-4 bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.1)] border border-[#eee] w-[214px] h-[214px] flex items-center justify-center">
            {loading && (
              <div className="text-center text-sm flex flex-col gap-2.5 items-center" style={{ color: 'var(--text-secondary)' }}>
                生成中…
              </div>
            )}
            {error && (
              <div className="text-center text-sm flex flex-col gap-2.5 items-center text-red-500">
                <div>⚠️ {error}</div>
                <button
                  type="button"
                  className="px-4 py-1.5 rounded-lg border border-red-500 bg-transparent text-red-500 cursor-pointer"
                  onClick={() => createOrder(method)}
                >
                  重试
                </button>
              </div>
            )}
            {!loading && !error && qrUrl && (
              <QRCodeSVG value={qrUrl} size={180} fgColor={method === 'wechat' ? '#07c160' : '#1677ff'} level="M" />
            )}
          </div>
          <div className="text-[15px] text-center" style={{ color: 'var(--text-secondary)' }}>
            {method === 'wechat' ? '打开微信，扫一扫完成支付' : '打开支付宝，扫一扫完成支付'}
          </div>
          <div className="text-[36px] font-black" style={{ color: theme.accent }}>¥{amount}</div>
          {orderId && (
            <div className="text-xs opacity-70" style={{ color: 'var(--text-secondary)' }}>订单号：{orderId}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center gap-3">
          {isMock ? (
            <button
              className="w-full py-4 rounded-[14px] border-none text-base font-bold cursor-pointer transition-opacity hover:opacity-90 shadow-[0_4px_20px_rgba(217,119,6,0.3)]"
              style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff' }}
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
              className="w-full py-4 rounded-[14px] border-none text-base font-bold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(118,75,162,0.3)]"
              style={{ background: 'linear-gradient(135deg,#667eea,#764ba2)', color: '#fff' }}
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
          {checkMsg && <div className="text-[13px] text-red-500">{checkMsg}</div>}
          <div className="text-[13px] opacity-60 mt-2" style={{ color: 'var(--text-secondary)' }}>
            🔒 支付安全加密 · 支持随时退订
          </div>
        </div>
      </div>
    </div>
  );
}
