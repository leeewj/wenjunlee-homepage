import { defineConfig } from 'vite';
import { contentPlugin } from './scripts/content-plugin';

// Served from the domain root (Cloudflare Pages + wenjunlee.com).
export default defineConfig({
  base: '/',
  plugins: [contentPlugin()],
  server: {
    host: true,
  },
});
