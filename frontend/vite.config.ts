import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心库
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 编辑器相关
          'editor-vendor': ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-placeholder', '@tiptap/extension-underline'],
          // 协作编辑
          'collab-vendor': ['yjs', 'y-websocket'],
          // 图形库
          'graph-vendor': ['@antv/g6', '@antv/g6-extension-react', 'reactflow'],
          // 工具库
          'utils-vendor': ['lucide-react', 'markdown-it', 'jszip'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false, // 生产环境关闭 sourcemap 以减小体积
    minify: 'esbuild', // 使用 esbuild 进行更快的压缩
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tiptap/react',
      '@tiptap/starter-kit',
    ],
  },
  // 开发服务器配置
  server: {
    port: 5173,
    open: false,
  },
})
