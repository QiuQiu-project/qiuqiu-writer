/**
 * 前端 API 地址配置（与 admin 一致：开发时用相对路径 + Vite 代理，生产可配 VITE_API_BASE_URL）
 * - 不设置或设为空：请求走相对路径 /api、/ai 等，由 Vite 代理或 Nginx 转发到后端
 * - 设置完整地址：如 http://api.qiuqiuwriter.top:8000，请求直接打该域名
 */
const FALLBACK_PROD_BASE = '';
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)
  ?? (import.meta.env.PROD ? FALLBACK_PROD_BASE : '');

/** 当前是否为“相对路径”模式（空 base，依赖代理） */
export const isRelativeApi = API_BASE_URL === '';

/**
 * 获取 WebSocket 基地址（Yjs 等）
 * 
 * 逻辑：
 * 1. 如果配置了 VITE_API_BASE_URL，优先使用它
 * 2. 如果是开发环境 (localhost)，且未配置 API_BASE_URL，
 *    优先通过当前 window.location 连接（利用 Vite 或 Nginx 代理）
 * 3. 生产环境使用 window.location.origin
 */
export function getWsBaseUrl(): string {
  // 1. 如果配置了 API_BASE_URL (如 https://api.example.com)，将其转换为 ws://
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/^http/, 'ws');
  }
  
  // 2. 在浏览器环境下，优先使用当前页面的 host
  // 这样无论是在 5173 (Vite) 还是 80 (Nginx) 下，都能正确走对应的代理
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // 包含端口号
    return `${protocol}//${host}`;
  }
  
  // 3. 服务端渲染或其他情况的兜底（开发环境后端默认端口）
  return 'ws://127.0.0.1:8000';
}
