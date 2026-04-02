import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/entrade': {
        target: 'https://services.entrade.com.vn/chart-api/v2/ohlcs',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/entrade/, '')
      }
    }
  }
})
