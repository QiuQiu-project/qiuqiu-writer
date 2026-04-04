import { useEffect, useRef, useState } from 'react';
import DraggableResizableModal from './DraggableResizableModal';
import { QRCodeSVG } from 'qrcode.react';
import { paymentApi, tokenApi, tokensToDisplay, type PlanConfig } from '../../utils/tokenApi';
import { cn } from '@/lib/utils';

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
  { bg: 'linear-gradient(135deg,#e8eaf6 0%,#c5cae9 100%)', accent: '#5c6bc0', icon: '🌱', btnClass: 'btn-gray' },
  { bg: 'linear-gradient(135deg,#ede7f6 0%,#b39ddb 100%)', accent: '#7c3aed', icon: '⭐', btnClass: 'btn-purple' },
  { bg: 'linear-gradient(135deg,#fff8e1 0%,#ffcc80 100%)', accent: '#d97706', icon: '👑', btnClass: 'btn-gold' },
  { bg: 'linear-gradient(135deg,#e3f2fd 0%,#90caf9 100%)', accent: '#1565c0', icon: '💎', btnClass: 'btn-blue' },
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
      <div className="flex flex-col items-center justify-center px-8 py-[60px] gap-3 text-center">
        <div className="text-[64px] leading-none">🎉</div>
        <h3 className="text-[22px] font-extrabold text-foreground m-0">支付成功！</h3>
        <p className="text-sm text-muted-foreground m-0">{plan.label} 套餐已激活，尽情创作吧</p>
        <button
          className="w-full max-w-[280px] py-3.5 rounded-xl border-none bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white text-[15px] font-bold cursor-pointer transition-opacity hover:opacity-90 shadow-[0_4px_16px_rgba(118,75,162,0.3)] tracking-wide mt-2"
          onClick={onClose}
          type="button"
        >
          开始创作
        </button>
      </div>
    );
  }

  return (
    <div className="px-8 py-7 flex flex-col gap-0">
      {/* 返回 */}
      <button
        className="self-start bg-transparent border-none text-muted-foreground text-[13px] cursor-pointer pb-4 transition-colors hover:text-foreground"
        onClick={onBack}
        type="button"
      >
        ← 返回套餐选择
      </button>

      {/* 订单摘要 */}
      <div className="flex items-center gap-3.5 bg-muted rounded-xl px-[18px] py-3.5 mb-5 border border-border">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
          style={{ background: theme.bg }}
        >
          {theme.icon}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-bold text-foreground mb-[3px]">
            {plan.label} · {BILLING_LABELS[cycle]}
          </div>
          <div className="text-xs text-muted-foreground">{plan.desc}</div>
        </div>
        <div className="text-[22px] font-extrabold shrink-0" style={{ color: theme.accent }}>
          ¥{amount}
        </div>
      </div>

      <div className="h-px bg-border mb-5 opacity-50" />

      {/* 支付方式选择 */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 bg-muted text-sm font-semibold text-muted-foreground cursor-pointer transition-all relative hover:border-gray-400',
            method === 'wechat' ? 'border-[#07c160] bg-[#f0faf4] text-[#07c160]' : 'border-border'
          )}
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
            <span className="absolute top-1.5 right-2 text-[11px] font-bold text-[#07c160]">✓</span>
          )}
        </button>

        <button
          type="button"
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 bg-muted text-sm font-semibold text-muted-foreground cursor-pointer transition-all relative hover:border-gray-400',
            method === 'alipay' ? 'border-[#1677ff] bg-[#f0f6ff] text-[#1677ff]' : 'border-border'
          )}
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
            <span className="absolute top-1.5 right-2 text-[11px] font-bold text-[#1677ff]">✓</span>
          )}
        </button>
      </div>

      {/* 二维码区域 */}
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className="relative p-3.5 bg-white rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.1)] border border-gray-100">
          {loading && (
            <div className="w-40 h-40 flex flex-col items-center justify-center text-[13px] text-muted-foreground text-center gap-1">
              生成中…
            </div>
          )}
          {error && (
            <div className="w-40 h-40 flex flex-col items-center justify-center text-[13px] text-red-500 text-center gap-1">
              <div>⚠️ {error}</div>
              <button
                type="button"
                onClick={() => createOrder(method)}
                className="mt-2 text-xs cursor-pointer"
              >
                重试
              </button>
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
        <div className="text-[13px] text-muted-foreground text-center">
          {method === 'wechat'
            ? '打开微信，扫一扫完成支付'
            : '打开支付宝，扫一扫完成支付'}
        </div>
        <div className="text-[28px] font-black" style={{ color: theme.accent }}>
          ¥{amount}
        </div>
        {orderId && (
          <div className="text-[11px] text-muted-foreground opacity-45">
            订单号：{orderId}
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="flex flex-col items-center gap-2.5">
        {isMock ? (
          <button
            className="w-full max-w-[280px] py-3.5 rounded-xl border-none bg-gradient-to-br from-amber-400 to-amber-600 text-white text-[15px] font-bold cursor-pointer transition-opacity hover:opacity-90 shadow-[0_4px_16px_rgba(217,119,6,0.3)] tracking-wide"
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
            className="w-full max-w-[280px] py-3.5 rounded-xl border-none bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white text-[15px] font-bold cursor-pointer transition-opacity hover:opacity-90 shadow-[0_4px_16px_rgba(118,75,162,0.3)] tracking-wide disabled:cursor-default disabled:opacity-50"
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
          <div className="text-xs text-red-500 mt-1.5 text-center">
            {checkMsg}
          </div>
        )}
        <div className="text-xs text-muted-foreground opacity-55">🔒 支付安全加密 · 支持随时退订</div>
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

  const btnGradientClass = {
    'btn-gray': '',
    'btn-purple': 'bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white border-transparent hover:opacity-90',
    'btn-gold': 'bg-gradient-to-br from-amber-400 to-amber-600 text-white border-transparent hover:opacity-90',
    'btn-blue': 'bg-gradient-to-br from-blue-500 to-blue-800 text-white border-transparent hover:opacity-90',
  }[theme.btnClass];

  return (
    <div
      className={cn(
        'relative flex-1 min-w-0 rounded-2xl border-[1.5px] border-border overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-[3px] hover:shadow-[0_12px_32px_rgba(0,0,0,0.12)] bg-background',
        plan.highlight && 'shadow-[0_6px_24px_rgba(124,58,237,0.18)]',
        isCurrent && 'opacity-60 hover:translate-y-0 hover:shadow-none'
      )}
      style={plan.highlight ? { borderColor: theme.accent } : {}}
    >
      {plan.badge && (
        <div
          className="absolute top-[-1px] right-3 text-white text-[11px] font-bold px-2.5 py-[3px] rounded-b-lg whitespace-nowrap tracking-[0.5px]"
          style={{ background: theme.accent }}
        >
          {plan.badge}
        </div>
      )}
      <div
        className="relative px-4 pt-[26px] pb-[18px] text-center flex flex-col items-center gap-2"
        style={{ background: theme.bg }}
      >
        <span className="text-[44px] leading-none" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.15))' }}>
          {theme.icon}
        </span>
        <div className="text-[15px] font-bold text-[#3d3d5c] tracking-[0.5px]">{plan.label}</div>
      </div>
      <div className="flex-1 flex flex-col px-[18px] pt-[18px] pb-[18px] gap-0">
        <div className="text-center min-h-[72px] flex flex-col items-center justify-end mb-1.5">
          {isFree ? (
            <div className="text-[28px] font-extrabold text-muted-foreground">免费</div>
          ) : (
            <>
              {hasDiscount && (
                <div className="text-xs text-muted-foreground line-through opacity-55 mb-0.5 leading-none">
                  原价 ¥{price!.original}
                </div>
              )}
              <div className="flex items-baseline gap-px">
                <span className="text-[17px] font-bold" style={{ color: theme.accent }}>¥</span>
                <span className="text-[40px] font-black leading-none" style={{ color: theme.accent }}>
                  {price!.current}
                </span>
                <span className="text-[13px] text-muted-foreground ml-[3px]">/{BILLING_LABELS[cycle]}</span>
              </div>
            </>
          )}
        </div>
        <div className="h-px bg-border my-3 opacity-60" />
        <div className="flex items-start gap-2 text-[13px] text-muted-foreground mb-2 leading-[1.5]">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]" style={{ background: theme.accent }} />
          每月可写 <strong className="text-foreground font-semibold">{tokensToDisplay(plan.tokens)}</strong>
        </div>
        {plan.desc && (
          <div className="flex items-start gap-2 text-[13px] text-muted-foreground mb-2 leading-[1.5]">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-[5px]" style={{ background: theme.accent }} />
            {plan.desc}
          </div>
        )}
        <button
          className={cn(
            'w-full py-3.5 rounded-xl border-[1.5px] border-border bg-transparent text-muted-foreground text-sm font-bold cursor-pointer transition-all mt-3.5 tracking-[0.5px]',
            '[&:not(:disabled):hover]:text-[#7c3aed] [&:not(:disabled):hover]:border-[#7c3aed]',
            'disabled:cursor-default disabled:opacity-45',
            btnGradientClass
          )}
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
      overlayClassName="qm-overlay"
      handleClassName=".qm-drag-handle"
      scrollable
    >
      <div
        className="qm-drag-handle"
        style={{ height: '30px', width: '100%', position: 'absolute', top: 0, left: 0, cursor: 'move', zIndex: 10 }}
      />
      <button
        className="absolute top-3.5 right-4 bg-white/20 border-none text-sm text-white/85 cursor-pointer w-7 h-7 rounded-full flex items-center justify-center transition-[background] hover:bg-white/35 hover:text-white"
        onClick={handleClose}
        type="button"
        aria-label="关闭"
        style={{ zIndex: 20 }}
      >
        ✕
      </button>

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
          <div className="relative bg-gradient-to-br from-[#667eea] via-[#764ba2] to-[#f093fb] px-8 pt-9 pb-[30px] text-center overflow-hidden">
            {/* decorative blobs */}
            <div className="absolute rounded-full opacity-15 bg-white w-[200px] h-[200px] -top-20 -left-[60px]" />
            <div className="absolute rounded-full opacity-15 bg-white w-[140px] h-[140px] -bottom-[50px] -right-[30px]" />
            <div className="relative text-[28px] tracking-[10px] mb-2.5" aria-hidden="true">
              <span>✨</span><span>⚡</span><span>✨</span>
            </div>
            <h2 className="relative text-[26px] font-extrabold text-white m-0 mb-2 [text-shadow:0_1px_4px_rgba(0,0,0,0.15)]">
              AI 额度已用完
            </h2>
            <p className="relative text-[15px] text-white/85 m-0">
              本月 Token 配额不足，升级套餐解锁无限创作
            </p>
          </div>

          <div className="flex gap-2.5 justify-center px-7 pt-[22px] pb-1.5">
            {BILLING_CYCLES.map((c) => {
              const saving = firstPaid ? calcSaving(firstPaid, c) : null;
              return (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1.5 px-[22px] py-2 rounded-[20px] border-[1.5px] border-border bg-transparent text-muted-foreground text-sm font-medium cursor-pointer transition-all whitespace-nowrap hover:border-violet-600 hover:text-violet-600',
                    cycle === c && 'bg-gradient-to-br from-[#667eea] to-[#764ba2] border-transparent text-white shadow-[0_2px_10px_rgba(118,75,162,0.35)] hover:text-white'
                  )}
                  onClick={() => setCycle(c)}
                >
                  {BILLING_LABELS[c]}
                  {saving && (
                    <span
                      className={cn(
                        'inline-block px-[7px] py-px rounded-[10px] text-[11px] font-bold',
                        cycle === c
                          ? 'bg-white/22'
                          : 'bg-amber-100 text-amber-600'
                      )}
                    >
                      {saving}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex gap-4 px-6 pt-5 pb-1.5 items-stretch">
            {plans.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 w-full">加载中…</div>
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

          <p className="text-center text-[13px] text-muted-foreground opacity-50 mt-3 mb-0">
            如需帮助，请联系客服升级套餐
          </p>
        </>
      )}
    </DraggableResizableModal>
  );
}
