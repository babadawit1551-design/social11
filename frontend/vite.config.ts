import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:8001',
      '/users': 'http://localhost:8001',
      '/posts': 'http://localhost:8002',
      '/media': 'http://localhost:8002',
      '/ai': 'http://localhost:8002',
      '/webhooks': 'http://localhost:8002',
      '/schedules': 'http://localhost:8003',
      '/analytics': 'http://localhost:8004',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    server: {
      deps: {
        fallbackCJS: true,
      },
    },
  },
  resolve: {
    alias: {
      '@testing-library/dom': path.resolve(__dirname, '../node_modules/@testing-library/dom'),
      '@testing-library/react': path.resolve(__dirname, '../node_modules/@testing-library/react'),
      '@testing-library/user-event': path.resolve(__dirname, '../node_modules/@testing-library/user-event'),
      '@testing-library/jest-dom': path.resolve(__dirname, '../node_modules/@testing-library/jest-dom'),
    },
  },
});
