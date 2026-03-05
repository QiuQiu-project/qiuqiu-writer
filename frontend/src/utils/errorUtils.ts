/**
 * 统一的 API 错误解析工具
 * 将技术性错误信息转换为用户友好的中文提示
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/** 判断是否是认证过期/未登录错误 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || (error.status === 403 && error.message.includes('Not authenticated'));
  }
  if (error instanceof Error) {
    return (
      error.message.includes('Not authenticated') ||
      error.message.includes('无效的认证') ||
      error.message.includes('认证凭据') ||
      error.message.includes('登录已过期')
    );
  }
  return false;
}

/** 将 Error 转为用户友好的中文提示 */
export function parseError(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message;

  // 认证错误
  if (msg.includes('Not authenticated')) return '请先登录后再操作';
  if (msg.includes('无效的认证') || msg.includes('认证凭据')) return '登录状态已过期，请重新登录';

  // 权限错误（直接显示后端返回的中文）
  if (msg.includes('没有') && msg.includes('权限')) return msg;
  if (msg.includes('只有') && msg.includes('创建者')) return msg;

  // 资源不存在
  if (msg.includes('不存在')) return msg;

  // 网络错误
  if (
    msg.includes('无法连接') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('Network request failed')
  ) {
    return '网络连接失败，请检查网络后重试';
  }

  // 服务器通用错误
  if (msg.startsWith('API request failed')) return '服务器错误，请稍后重试';

  return msg || fallback;
}
