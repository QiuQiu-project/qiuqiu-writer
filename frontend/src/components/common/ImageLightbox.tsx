/**
 * ImageLightbox — 全站图片放大查看
 * 通过全局点击事件代理实现，无需修改任何子组件。
 * 排除规则：button 内的图片、a 链接内的图片、.no-lightbox 容器内的图片
 */
import { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';

interface LightboxState {
  src: string;
  alt: string;
}

export default function ImageLightbox() {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [scale, setScale] = useState(1);

  const open = useCallback((src: string, alt: string) => {
    setLightbox({ src, alt });
    setScale(1);
    document.body.style.overflow = 'hidden';
  }, []);

  const close = useCallback(() => {
    setLightbox(null);
    document.body.style.overflow = '';
  }, []);

  // 全局点击代理
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'IMG') return;
      const img = target as HTMLImageElement;
      // 排除：无效 src、data-no-lightbox 属性、button/a/no-lightbox 容器内
      if (!img.src || img.dataset.noLightbox !== undefined) return;
      if (img.closest('button, a, .no-lightbox')) return;
      // 排除极小图片（图标、favicon 等）
      if (img.naturalWidth > 0 && img.naturalWidth < 48 && img.naturalHeight < 48) return;
      e.stopPropagation();
      open(img.src, img.alt || '');
    };
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [open]);

  // Escape 关闭
  useEffect(() => {
    if (!lightbox) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightbox, close]);

  // 滚轮缩放
  useEffect(() => {
    if (!lightbox) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale(s => Math.min(4, Math.max(0.5, s - e.deltaY * 0.001)));
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [lightbox]);

  if (!lightbox) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center cursor-zoom-out backdrop-blur-[6px] [animation:lb-fade-in_0.15s_ease]"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={close}
    >
      {/* 工具栏 */}
      <div
        className="fixed top-4 right-4 flex items-center gap-1.5 z-[100000]"
        onClick={e => e.stopPropagation()}
      >
        {[
          { icon: ZoomIn, label: '放大', action: () => setScale(s => Math.min(4, s + 0.25)) },
          { icon: ZoomOut, label: '缩小', action: () => setScale(s => Math.max(0.25, s - 0.25)) },
          { icon: X, label: '关闭 (Esc)', action: close },
        ].map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            className="w-[34px] h-[34px] rounded-[8px] border cursor-pointer flex items-center justify-center transition-[background_0.15s,border-color_0.15s] backdrop-blur-[8px] hover:border-white/30 hover:text-white"
            style={{
              borderColor: 'rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.55)',
              color: 'rgba(255,255,255,0.85)',
            }}
            onClick={action}
            title={label}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* 图片 */}
      <div
        className="max-w-[96vw] max-h-[92vh] flex items-center justify-center cursor-default overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={lightbox.src}
          alt={lightbox.alt}
          className="max-w-[96vw] max-h-[92vh] object-contain rounded-[6px] select-none transition-transform duration-200 [transform-origin:center_center] [animation:lb-img-in_0.2s_ease]"
          style={{
            transform: `scale(${scale})`,
            boxShadow: '0 8px 60px rgba(0,0,0,0.6)',
          }}
          draggable={false}
        />
      </div>

      {/* 提示 */}
      <div
        className="fixed bottom-5 left-1/2 -translate-x-1/2 text-[11px] whitespace-nowrap pointer-events-none tracking-[0.04em]"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        滚轮缩放 · 点击空白处关闭
      </div>
    </div>
  );
}
