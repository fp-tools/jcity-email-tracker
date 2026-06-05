import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/pixel': 'http://localhost:3000',
      '/click': 'http://localhost:3000',
      '/conversion': 'http://localhost:3000'
    }
  }
});
