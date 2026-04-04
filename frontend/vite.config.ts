import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
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
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'editor-vendor': [
              '@tiptap/react', '@tiptap/starter-kit',
              '@tiptap/extension-placeholder', '@tiptap/extension-underline',
              '@tiptap/extension-collaboration', '@tiptap/extension-collaboration-cursor',
              'y-prosemirror',
            ],
            'graph-vendor': ['@antv/g6', '@antv/g6-extension-react', 'reactflow'],
            'utils-vendor': ['lucide-react', 'markdown-it', 'jszip'],
          }
        }
      },
      chunkSizeWarningLimit: 1000,
      sourcemap: true,
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
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          xfwd: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
        '/ai': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          xfwd: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
        '/v1': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          xfwd: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
      },
    },
    server: {
      port: 5173,
      open: false,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          xfwd: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
        '/ai': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          xfwd: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
        '/v1': {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          secure: false,
          xfwd: true,
          timeout: 300000,
          proxyTimeout: 300000,
        },
      },
    },
  }
})
