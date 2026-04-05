/**
 * 头像工具函数
 * 提供默认头像生成和头像URL处理功能
 */

const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706',
  '#dc2626', '#9333ea', '#0891b2', '#be185d',
];

function pickColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

/**
 * 生成默认头像 SVG data URL（基于用户名首字母，不依赖外部服务）
 */
export function getDefaultAvatarUrl(
  username: string,
  displayName?: string
): string {
  const name = displayName || username;
  const initial = name.charAt(0).toUpperCase();
  const bg = pickColor(name);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="${bg}"/><text x="20" y="26" font-family="system-ui,sans-serif" font-size="18" font-weight="700" fill="white" text-anchor="middle">${initial}</text></svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * 获取用户头像URL（如果有自定义头像则使用，否则使用默认头像）
 */
export function getUserAvatarUrl(
  avatarUrl?: string | null,
  username?: string,
  displayName?: string
): string {
  if (avatarUrl) {
    return avatarUrl;
  }
  return getDefaultAvatarUrl(username || 'User', displayName);
}

/**
 * 获取用户头像的首字母（用于占位符）
 */
export function getAvatarInitial(
  username?: string,
  displayName?: string
): string {
  const name = displayName || username || 'U';
  return name.charAt(0).toUpperCase();
}
