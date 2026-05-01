import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'background.png'],
        manifest: {
          name: 'ClassLens AI Attendance',
          short_name: 'ClassLens',
          description: 'Premium AI-Powered Attendance & Security System',
          theme_color: '#2563eb',
          background_color: '#000000',
          display: 'standalone',
          icons: [
            {
              src: 'favicon.ico',
              sizes: '64x64 32x32 24x24 16x16',
              type: 'image/x-icon'
            },
            {
              src: 'logo192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'logo512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
          secure: false,
          timeout: 30000,
        },
      },
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
