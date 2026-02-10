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
 * 相对路径模式下用当前页面 origin 并改为 ws(s)
 */
export function getWsBaseUrl(): string {
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/^http/, 'ws');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin.replace(/^http/, 'ws');
  }
  return 'ws://localhost:8001';
}
