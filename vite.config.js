import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    sourcemap: false,
    minify: 'terser',
    terserOptions: { compress: true, mangle: true, format: { comments: false } },
  },
});
