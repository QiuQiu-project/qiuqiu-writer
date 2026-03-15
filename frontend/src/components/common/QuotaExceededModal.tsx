import { useEffect, useRef, useState } from 'react';
import DraggableResizableModal from './DraggableResizableModal';
import { QRCodeSVG } from 'qrcode.react';
import { paymentApi, tokenApi, tokensToDisplay, type PlanConfig } from '../../utils/tokenApi';
import './QuotaExceededModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
}

type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
type PayMethod = 'wechat' | 'alipay';

const BILLING_CYCLES: BillingCycle[] = ['monthly', 'quarterly', 'yearly'];
const BILLING_LABELS: Record<BillingCycle, string> = {
  monthly: '月付',
  quarterly: '季付',
  yearly: '年付',
};

const PLAN_THEMES = [
  { bg: 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)', accent: '#5c6bc0', icon: '🌱', btnClass: 'qm-plan__btn--gray' },
  { bg: 'linear-gradient(135deg,#ede7f6 0%,#b39ddb 100%)', accent: '#7c3aed', icon: '⭐', btnClass: 'qm-plan__btn--purple' },
  { bg: 'linear-gradient(135deg,#fff8e1 0%,#ffcc80 100%)', accent: '#d97706', icon: '👑', btnClass: 'qm-plan__btn--gold' },
  { bg: 'linear-gradient(135deg,#e3f2fd 0%,#90caf9 100%)', accent: '#1565c0', icon: '💎', btnClass: 'qm-plan__btn--blue' },
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

// ── 支付弹层 ──────────────────────────────────────────────────────────────────
interface PaymentPanelProps {
  plan: PlanConfig;
  cycle: BillingCycle;
  themeIndex: number;
  onBack: () => void;
  onClose: () => void;
}

function PaymentPanel({ plan, cycle, themeIndex, onBack, onClose }: PaymentPanelProps) {
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

  // 创建订单并获取二维码
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
      // 开始轮询订单状态
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await paymentApi.getOrderStatus(res.order_id);
          if (statusRes.status === 'paid') {
            if (pollRef.current) clearInterval(pollRef.current);
            setPaid(true);
          }
        } catch {
          // 忽略轮询错误，继续轮询
        }
      }, 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '下单失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 切换支付方式时重新创建订单
  const handleMethodChange = (m: PayMethod) => {
    setMethod(m);
    createOrder(m);
  };

  // 首次进入支付面板时自动创建订单
  useEffect(() => {
    createOrder(method);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 支付成功状态
  if (paid) {
    return (
      <div className="qm-payment qm-payment--success">
        <div className="qm-success__icon">🎉</div>
        <h3 className="qm-success__title">支付成功！</h3>
        <p className="qm-success__desc">{plan.label} 套餐已激活，尽情创作吧</p>
        <button className="qm-payment__paid-btn" onClick={onClose} type="button">
          开始创作
        </button>
      </div>
    );
  }

  return (
    <div className="qm-payment">
      {/* 返回 */}
      <button className="qm-payment__back" onClick={onBack} type="button">
        ← 返回套餐选择
      </button>

      {/* 订单摘要 */}
      <div className="qm-payment__order">
        <div className="qm-payment__order-icon" style={{ background: theme.bg }}>
          {theme.icon}
        </div>
        <div className="qm-payment__order-info">
          <div className="qm-payment__order-name">{plan.label} · {BILLING_LABELS[cycle]}</div>
          <div className="qm-payment__order-desc">{plan.desc}</div>
        </div>
        <div className="qm-payment__order-price" style={{ color: theme.accent }}>
          ¥{amount}
        </div>
      </div>

      <div className="qm-payment__divider" />

      {/* 支付方式选择 */}
      <div className="qm-payment__methods">
        <button
          type="button"
          className={`qm-payment__method qm-payment__method--wechat${method === 'wechat' ? ' qm-payment__method--active' : ''}`}
          onClick={() => handleMethodChange('wechat')}
        >
          <span className="qm-payment__method-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9.5 2C5.36 2 2 4.91 2 8.5c0 2.02 1.06 3.82 2.72 5.02L4 16l2.5-1.25C7.26 14.9 8.35 15 9.5 15c.17 0 .34 0 .5-.01A5.99 5.99 0 0 0 10 14c0-3.31 2.91-6 6.5-6 .17 0 .34 0 .5.01C16.07 4.57 13.08 2 9.5 2z" fill="#07c160"/>
              <path d="M16.5 10C13.46 10 11 12.01 11 14.5c0 1.38.72 2.61 1.85 3.45L12.5 20l2-1c.62.17 1.28.25 1.98.25.09 0 .17 0 .26-.01A4.36 4.36 0 0 0 17 19c2.76 0 5-1.79 5-4s-2.24-5-5.5-5z" fill="#07c160" opacity=".85"/>
            </svg>
          </span>
          微信支付
          {method === 'wechat' && <span className="qm-payment__method-check">✓</span>}
        </button>

        <button
          type="button"
          className={`qm-payment__method qm-payment__method--alipay${method === 'alipay' ? ' qm-payment__method--active' : ''}`}
          onClick={() => handleMethodChange('alipay')}
        >
          <span className="qm-payment__method-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="5" fill="#1677FF"/>
              <path d="M20 15.3c-1.9-.8-4.5-2-6.4-3 .5-1 .9-2.3 1-3.8H17V7h-4.5V5.5h-2V7H6v1.5h8.1c-.1 1-.4 1.9-.7 2.7-1.6-.8-2.9-1.3-3.9-1.3-2 0-3.4 1.2-3.4 2.9 0 1.8 1.5 3 3.7 3 1.6 0 3.1-.7 4.3-1.9 1.6.9 3.8 2 5.9 2.8V15.3z" fill="white"/>
              <path d="M9.5 13.3c-1 0-1.7-.5-1.7-1.3 0-.7.6-1.3 1.7-1.3.8 0 1.8.4 3 1.1-.9.9-1.9 1.5-3 1.5z" fill="#1677FF"/>
            </svg>
          </span>
          支付宝
          {method === 'alipay' && <span className="qm-payment__method-check">✓</span>}
        </button>
      </div>

      {/* 二维码区域 */}
      <div className="qm-payment__qr-wrap">
        <div className="qm-payment__qr-box">
          {loading && (
            <div className="qm-payment__qr-loading">生成中…</div>
          )}
          {error && (
            <div className="qm-payment__qr-error">
              <div>⚠️ {error}</div>
              <button type="button" onClick={() => createOrder(method)} style={{ marginTop: 8, fontSize: 12, cursor: 'pointer' }}>重试</button>
            </div>
          )}
          {!loading && !error && qrUrl && (
            <QRCodeSVG
              value={qrUrl}
              size={160}
              fgColor={method === 'wechat' ? '#07c160' : '#1677ff'}
              level="M"
            />
          )}
        </div>
        <div className="qm-payment__qr-tip">
          {method === 'wechat'
            ? '打开微信，扫一扫完成支付'
            : '打开支付宝，扫一扫完成支付'}
        </div>
        <div className="qm-payment__amount-big" style={{ color: theme.accent }}>
          ¥{amount}
        </div>
        {orderId && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.45 }}>
            订单号：{orderId}
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="qm-payment__footer">
        {isMock ? (
          <button
            className="qm-payment__paid-btn qm-payment__paid-btn--mock"
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
            className="qm-payment__paid-btn"
            disabled={checking}
            onClick={async () => {
              if (!orderId) return;
              setChecking(true);
              setCheckMsg(null);
              try {
                const r = await paymentApi.getOrderStatus(orderId);
                if (r.status === 'paid') {
                  setPaid(true);
                } else {
                  setCheckMsg('未检测到支付，请完成扫码支付后再试');
                }
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
        {checkMsg && (
          <div style={{ fontSize: 12, color: '#e53e3e', marginTop: 6, textAlign: 'center' }}>
            {checkMsg}
          </div>
        )}
        <div className="qm-payment__secure">🔒 支付安全加密 · 支持随时退订</div>
      </div>
    </div>
  );
}

// ── 套餐卡片 ──────────────────────────────────────────────────────────────────
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
      className={[
        'qm-plan',
        plan.highlight ? 'qm-plan--highlight' : '',
        isCurrent ? 'qm-plan--current' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--plan-accent': theme.accent } as React.CSSProperties}
    >
      {plan.badge && <div className="qm-plan__badge" style={{ background: theme.accent }}>{plan.badge}</div>}
      <div className="qm-plan__hero" style={{ background: theme.bg }}>
        <span className="qm-plan__hero-icon">{theme.icon}</span>
        <div className="qm-plan__name">{plan.label}</div>
      </div>
      <div className="qm-plan__body">
        <div className="qm-plan__pricing">
          {isFree ? (
            <div className="qm-plan__price-free">免费</div>
          ) : (
            <>
              {hasDiscount && <div className="qm-plan__price-original">原价 ¥{price!.original}</div>}
              <div className="qm-plan__price-row">
                <span className="qm-plan__price-currency" style={{ color: theme.accent }}>¥</span>
                <span className="qm-plan__price-amount" style={{ color: theme.accent }}>{price!.current}</span>
                <span className="qm-plan__price-unit">/{BILLING_LABELS[cycle]}</span>
              </div>
            </>
          )}
        </div>
        <div className="qm-plan__divider" />
        <div className="qm-plan__feature">
          <span className="qm-plan__feature-dot" style={{ background: theme.accent }} />
          每月可写 <strong>{tokensToDisplay(plan.tokens)}</strong>
        </div>
        {plan.desc && (
          <div className="qm-plan__feature">
            <span className="qm-plan__feature-dot" style={{ background: theme.accent }} />
            {plan.desc}
          </div>
        )}
        <button
          className={`qm-plan__btn ${theme.btnClass}`}
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

// ── 主 Modal ──────────────────────────────────────────────────────────────────
export default function QuotaExceededModal({ isOpen, onClose, currentPlan = 'free' }: Props) {
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [payTarget, setPayTarget] = useState<{ plan: PlanConfig; themeIndex: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    tokenApi.getPlanConfigs().then(setPlans).catch(() => {});
  }, [isOpen]);

  // 关闭时重置支付步骤
  const handleClose = () => {
    setPayTarget(null);
    onClose();
  };

  if (!isOpen) return null;

  const firstPaid = plans.find((p) => (p.pricing?.monthly?.current ?? 0) > 0);

  return (
    <DraggableResizableModal
      isOpen={isOpen}
      onClose={handleClose}
      initialWidth={960}
      initialHeight={600}
      className="qm-modal"
      handleClassName=".qm-drag-handle"
      scrollable
    >
      <div className="qm-drag-handle" style={{ height: '30px', width: '100%', position: 'absolute', top: 0, left: 0, cursor: 'move', zIndex: 10 }} />
      <button className="qm-close" onClick={handleClose} type="button" aria-label="关闭" style={{ zIndex: 20 }}>✕</button>

      {payTarget ? (
        // ── Step 2: 支付 ──
        <PaymentPanel
          plan={payTarget.plan}
          cycle={cycle}
          themeIndex={payTarget.themeIndex}
          onBack={() => setPayTarget(null)}
          onClose={handleClose}
        />
      ) : (
        // ── Step 1: 套餐选择 ──
        <>
          <div className="qm-header">
            <div className="qm-header__deco" aria-hidden="true">
              <span>✨</span><span>⚡</span><span>✨</span>
            </div>
            <h2 className="qm-header__title">AI 额度已用完</h2>
            <p className="qm-header__subtitle">本月 Token 配额不足，升级套餐解锁无限创作</p>
          </div>

          <div className="qm-tabs">
            {BILLING_CYCLES.map((c) => {
              const saving = firstPaid ? calcSaving(firstPaid, c) : null;
              return (
                <button
                  key={c}
                  type="button"
                  className={`qm-tab${cycle === c ? ' qm-tab--active' : ''}`}
                  onClick={() => setCycle(c)}
                >
                  {BILLING_LABELS[c]}
                  {saving && <span className="qm-tab__saving">{saving}</span>}
                </button>
              );
            })}
          </div>

          <div className="qm-plans">
            {plans.length === 0 ? (
              <div className="qm-loading">加载中…</div>
            ) : (
              plans.map((plan, i) => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  cycle={cycle}
                  isCurrent={plan.key === currentPlan}
                  themeIndex={i}
                  onUpgrade={() => setPayTarget({ plan, themeIndex: i })}
                />
              ))
            )}
          </div>

          <p className="qm-footer">如需帮助，请联系客服升级套餐</p>
        </>
      )}
    </DraggableResizableModal>
  );
}
