import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 强制模块去重：确保 y-prosemirror 和 ProseMirror 核心只有单一实例
  // 解决 @tiptap/extension-collaboration 和 collaboration-cursor 的 PluginKey 冲突
  resolve: {
    alias: {
      'y-prosemirror': path.resolve(__dirname, 'node_modules/y-prosemirror'),
      'prosemirror-state': path.resolve(__dirname, 'node_modules/prosemirror-state'),
      'prosemirror-view': path.resolve(__dirname, 'node_modules/prosemirror-view'),
      'prosemirror-model': path.resolve(__dirname, 'node_modules/prosemirror-model'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React 核心库
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 编辑器相关
          'editor-vendor': [
            '@tiptap/react', '@tiptap/starter-kit',
            '@tiptap/extension-placeholder', '@tiptap/extension-underline',
            '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-cursor',
            'y-prosemirror',
          ],
          // 图形库
          'graph-vendor': ['@antv/g6', '@antv/g6-extension-react', 'reactflow'],
          // 工具库
          'utils-vendor': ['lucide-react', 'markdown-it', 'jszip'],
        }
      }
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
    minify: 'esbuild',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-collaboration',
      '@tiptap/extension-collaboration-cursor',
      'y-prosemirror',
      'y-websocket',
    ],
  },
  // 开发服务器配置
  server: {
    port: 5173,
    open: false,
  },
})
