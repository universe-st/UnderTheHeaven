import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'cordova/www',
    emptyOutDir: true,
    target: 'es2020'
  },
  server: {
    port: 5173,
    open: true
  }
});
