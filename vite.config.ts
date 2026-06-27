import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'cordova/www',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          engine: ['src/engine/HandRecognizer.ts', 'src/engine/AIBrain.ts', 'src/engine/DamageCalculator.ts'],
          skills: ['src/skills/index.ts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  test: {
    environment: 'node',
  },
});
