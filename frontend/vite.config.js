import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries in their own chunks: smaller files that stay cached
        // between deploys of the app code
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom', 'react-responsive', 'prop-types'],
          mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // main.jsx only mounts the app; tests and test setup aren't app code
      exclude: ['src/main.jsx', 'src/**/*.test.*', 'src/test/**'],
      reporter: ['text-summary', 'text'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
})
