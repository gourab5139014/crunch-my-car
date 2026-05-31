import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // libheif-js contains complex emscripten output — exclude it from Vite's
    // pre-bundling so the raw module is served as-is to the browser.
    exclude: ['libheif-js'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
