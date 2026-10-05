import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/web-ifc/*.wasm',
          dest: 'web-ifc',
        },
      ],
    }),
  ],
  optimizeDeps: {
    exclude: ['@thatopen/fragments', '@thatopen/components'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
