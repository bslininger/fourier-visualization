import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        fourier: resolve(__dirname, 'fourier/index.html'),
      },
    },
  },
});