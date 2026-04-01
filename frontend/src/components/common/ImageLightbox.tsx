/**
 * ImageLightbox — 全站图片放大查看
 * 通过全局点击事件代理实现，无需修改任何子组件。
 * 排除规则：button 内的图片、a 链接内的图片、.no-lightbox 容器内的图片
 */
import { useState, useEffect, useCallback } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import './ImageLightbox.css';

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
    <div className="lb-overlay" onClick={close}>
      {/* 工具栏 */}
      <div className="lb-toolbar" onClick={e => e.stopPropagation()}>
        <button className="lb-btn" onClick={() => setScale(s => Math.min(4, s + 0.25))} title="放大">
          <ZoomIn size={16} />
        </button>
        <button className="lb-btn" onClick={() => setScale(s => Math.max(0.25, s - 0.25))} title="缩小">
          <ZoomOut size={16} />
        </button>
        <button className="lb-btn" onClick={close} title="关闭 (Esc)">
          <X size={16} />
        </button>
      </div>

      {/* 图片 */}
      <div className="lb-content" onClick={e => e.stopPropagation()}>
        <img
          src={lightbox.src}
          alt={lightbox.alt}
          className="lb-img"
          style={{ transform: `scale(${scale})` }}
          draggable={false}
        />
      </div>

      {/* 提示 */}
      <div className="lb-hint">滚轮缩放 · 点击空白处关闭</div>
    </div>
  );
}
