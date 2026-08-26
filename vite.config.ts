import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Admin app — React 18 + Vite 6 (ADR-012: React, not Next; no SEO need).
 * Port 3001 is the single source of truth in versions.md:
 *   4000 backend · 3000 customer · 3001 admin.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    strictPort: true,
  },
  preview: {
    port: 3001,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
        },
        // `echarts` (dashboards, M10) and `react-quill` (notice composer, M8)
        // are installed but not yet imported. They are deliberately NOT listed
        // here: naming an unimported module produces an empty chunk and a build
        // warning. Rollup splits them automatically once the screens that use
        // them arrive and import them lazily.
      },
    },
  },
});
