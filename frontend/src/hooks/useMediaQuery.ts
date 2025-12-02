import { useState, useEffect } from 'react';

/**
 * 检测媒体查询的 Hook
 * @param query 媒体查询字符串，例如 '(max-width: 768px)'
 * @returns 是否匹配该媒体查询
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    
    // 初始化状态
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    
    // 监听变化
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };
    
    // 现代浏览器
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    } else {
      // 兼容旧浏览器
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [matches, query]);

  return matches;
}

/**
 * 检测是否为移动端的 Hook
 */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)');
}

/**
 * 检测是否为平板端的 Hook
 */
export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
}

/**
 * 检测是否为桌面端的 Hook
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1025px)');
}

