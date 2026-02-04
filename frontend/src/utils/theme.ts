// 主题配置类型
export interface ThemeConfig {
  id: string;
  name: string;
  colors: {
    // 背景色
    bgPrimary: string;
    bgSecondary: string;
    bgTertiary: string;
    bgSidebar: string;
    bgGradientStart: string;
    bgGradientEnd: string;
    // 文字颜色
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textInverse: string;
    // 边框颜色
    borderColor: string;
    borderLight: string;
    // 主题色
    accentPrimary: string;
    accentSecondary: string;
    accentTertiary: string;
    accentHover: string;
  };
}

// 预定义主题 - 极简黑、白、灰风格
export const themes: ThemeConfig[] = [
  {
    id: 'blue',
    name: '浅色主题',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f8f8f8',
      bgTertiary: '#f4f4f4',
      bgSidebar: '#ffffff',
      bgGradientStart: '#f0f0f0',
      bgGradientEnd: '#e8e8e8',
      textPrimary: '#000000',
      textSecondary: '#333333',
      textTertiary: '#666666',
      textInverse: '#ffffff',
      borderColor: '#e0e0e0',
      borderLight: '#f5f5f5',
      accentPrimary: '#000000',
      accentSecondary: '#333333',
      accentTertiary: '#666666',
      accentHover: '#333333',
    },
  },
  {
    id: 'dark',
    name: '深色模式',
    colors: {
      bgPrimary: '#2f2e2eff',
      bgSecondary: '#242424',
      bgTertiary: '#2a2a2a',
      bgSidebar: '#1b1b1b',
      bgGradientStart: '#2f2f2f',
      bgGradientEnd: '#1b1b1b',
      textPrimary: '#e6e6e6',
      textSecondary: '#bdbdbd',
      textTertiary: '#8f8f8f',
      textInverse: '#ffffff',
      borderColor: '#2f2f2f',
      borderLight: '#262626',
      accentPrimary: '#3a3a3a',
      accentSecondary: '#4a4a4a',
      accentTertiary: '#6b6b6b',
      accentHover: '#4f4f4f',
    },
  },
];

// 主题存储键
const THEME_STORAGE_KEY = 'planetwriter_theme';

// 获取当前主题
export function getCurrentTheme(): string {
  if (typeof window === 'undefined') return 'green';
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return saved || 'green';
}

// 保存主题选择
export function saveTheme(themeId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
}

// 应用主题
export function applyTheme(themeId: string): void {
  const theme = themes.find(t => t.id === themeId) || themes[0];
  const root = document.documentElement;
  
  // 应用CSS变量
  root.style.setProperty('--bg-primary', theme.colors.bgPrimary);
  root.style.setProperty('--bg-secondary', theme.colors.bgSecondary);
  root.style.setProperty('--bg-tertiary', theme.colors.bgTertiary);
  root.style.setProperty('--bg-sidebar', theme.colors.bgSidebar);
  root.style.setProperty('--bg-gradient-start', theme.colors.bgGradientStart);
  root.style.setProperty('--bg-gradient-end', theme.colors.bgGradientEnd);
  root.style.setProperty('--text-primary', theme.colors.textPrimary);
  root.style.setProperty('--text-secondary', theme.colors.textSecondary);
  root.style.setProperty('--text-tertiary', theme.colors.textTertiary);
  root.style.setProperty('--text-inverse', theme.colors.textInverse);
  root.style.setProperty('--border-color', theme.colors.borderColor);
  root.style.setProperty('--border-light', theme.colors.borderLight);
  root.style.setProperty('--accent-primary', theme.colors.accentPrimary);
  root.style.setProperty('--accent-secondary', theme.colors.accentSecondary);
  root.style.setProperty('--accent-tertiary', theme.colors.accentTertiary);
  root.style.setProperty('--accent-hover', theme.colors.accentHover);
  
  // 更新渐变
  root.style.setProperty(
    '--bg-gradient-light',
    `linear-gradient(135deg, ${theme.colors.bgGradientStart} 0%, ${theme.colors.bgGradientEnd} 100%)`
  );
  root.style.setProperty(
    '--bg-gradient-soft',
    `linear-gradient(135deg, ${theme.colors.bgGradientStart}08 0%, ${theme.colors.bgGradientEnd}08 100%)`
  );
  root.style.setProperty(
    '--accent-gradient',
    `linear-gradient(135deg, ${theme.colors.bgGradientStart} 0%, ${theme.colors.bgGradientEnd} 100%)`
  );
  root.style.setProperty(
    '--accent-light',
    `${theme.colors.accentPrimary}26`
  );
  
  // 保存主题选择
  saveTheme(themeId);
}

// 初始化主题（在应用启动时调用）
export function initTheme(): void {
  const currentTheme = getCurrentTheme();
  applyTheme(currentTheme);
}

