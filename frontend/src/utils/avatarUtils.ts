/**
 * 头像工具函数
 * 提供默认头像生成和头像URL处理功能
 */

/**
 * 生成默认头像URL（基于用户名首字母）
 * @param username 用户名
 * @param displayName 昵称（可选）
 * @returns 默认头像URL（使用UI Avatars服务）
 */
export function getDefaultAvatarUrl(
  username: string,
  displayName?: string
): string {
  const name = displayName || username;
  const initial = name.charAt(0).toUpperCase();
  
  // 使用UI Avatars生成默认头像
  const colors = [
    'FF6B6B', '4ECDC4', '45B7D1', 'FFA07A', 
    '98D8C8', 'F7DC6F', 'BB8FCE', '85C1E2'
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex];
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=${bgColor}&color=fff&size=128&bold=true`;
}

/**
 * 获取用户头像URL（如果有自定义头像则使用，否则使用默认头像）
 * @param avatarUrl 用户自定义头像URL（可选）
 * @param username 用户名
 * @param displayName 昵称（可选）
 * @returns 头像URL
 */
export function getUserAvatarUrl(
  avatarUrl?: string | null,
  username?: string,
  displayName?: string
): string {
  if (avatarUrl) {
    return avatarUrl;
  }
  
  if (username) {
    return getDefaultAvatarUrl(username, displayName);
  }
  
  // 如果连用户名都没有，返回一个通用的默认头像
  return getDefaultAvatarUrl('User');
}

/**
 * 获取用户头像的首字母（用于占位符）
 * @param username 用户名
 * @param displayName 昵称（可选）
 * @returns 首字母
 */
export function getAvatarInitial(
  username?: string,
  displayName?: string
): string {
  const name = displayName || username || 'U';
  return name.charAt(0).toUpperCase();
}


