/**
 * 前端 API 地址配置（与 admin 一致：开发时用相对路径 + Vite 代理，生产可配 VITE_API_BASE_URL）
 * - 不设置或设为空：请求走相对路径 /api、/ai 等，由 Vite 代理或 Nginx 转发到后端
 * - 设置完整地址：如 https://api.example.com，请求直接打该域名
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

/** 当前是否为“相对路径”模式（空 base，依赖代理） */
export const isRelativeApi = API_BASE_URL === '';

/**
 * 获取 WebSocket 基地址（Yjs 等）
 * 
 * 重要：WebSocket 连接应该直接连接到后端，而不是通过 Vite 代理
 * 因为 Vite 的 HTTP 代理可能不支持 WebSocket 升级
 * 
 * 开发环境：直接连接到后端 (ws://localhost:8001)
 * 生产环境：使用 API_BASE_URL 或当前 origin
 */
export function getWsBaseUrl(): string {
  // 如果配置了 API_BASE_URL，使用它（转换为 ws://）
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/^http/, 'ws');
  }
  
  // 开发环境：直接连接到后端，避免 Vite 代理问题
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isDev = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    if (isDev) {
      // 开发环境：直接连接后端，确保所有前端实例连接到同一个后端
      return 'ws://localhost:8001';
    }
    // 生产环境：使用当前 origin
    return window.location.origin.replace(/^http/, 'ws');
  }
  
  return 'ws://localhost:8001';
}
