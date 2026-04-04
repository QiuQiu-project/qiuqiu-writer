/**
 * Hook: UI状态管理
 * 管理侧边栏、菜单等UI状态
 */

import { useState, useCallback } from 'react';
import { useIsMobile } from './useMediaQuery';

export type NavItem = 'work-info' | 'tags' | 'outline' | 'characters' | 'settings' | 'map' | 'factions';

export interface UseUIStateReturn {
  // 导航状态
  activeNav: NavItem;
  setActiveNav: (nav: NavItem) => void;
  
  // 侧边栏折叠状态
  leftSidebarCollapsed: boolean;
  rightSidebarCollapsed: boolean;
  setLeftSidebarCollapsed: (collapsed: boolean) => void;
  setRightSidebarCollapsed: (collapsed: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  
  // 移动端菜单
  mobileMenuOpen: boolean;
  mobileChatOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  setMobileChatOpen: (open: boolean) => void;
  
  // 其他UI状态
  showWordCountTooltip: boolean;
  setShowWordCountTooltip: (show: boolean) => void;
  headingMenuOpen: boolean;
  setHeadingMenuOpen: (open: boolean) => void;
}

export function useUIState(): UseUIStateReturn {
  const isMobile = useIsMobile();
  const [activeNav, setActiveNav] = useState<NavItem>('work-info');
  // 移动端刷新后默认折叠侧边栏，避免出现灰色遮罩
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => isMobile);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(() => isMobile);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [showWordCountTooltip, setShowWordCountTooltip] = useState(false);
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false);
  
  const toggleLeftSidebar = useCallback(() => {
    setLeftSidebarCollapsed(prev => !prev);
  }, []);
  
  const toggleRightSidebar = useCallback(() => {
    setRightSidebarCollapsed(prev => !prev);
  }, []);
  
  return {
    activeNav,
    setActiveNav,
    leftSidebarCollapsed,
    rightSidebarCollapsed,
    setLeftSidebarCollapsed,
    setRightSidebarCollapsed,
    toggleLeftSidebar,
    toggleRightSidebar,
    mobileMenuOpen,
    mobileChatOpen,
    setMobileMenuOpen,
    setMobileChatOpen,
    showWordCountTooltip,
    setShowWordCountTooltip,
    headingMenuOpen,
    setHeadingMenuOpen,
  };
}
