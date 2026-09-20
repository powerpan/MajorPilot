import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: 'localhost', port: 15173, strictPort: true,
    proxy: {
      '/api/public/v1': { target: 'http://127.0.0.1:18080' },
      '/api/app/v1': { target: 'http://127.0.0.1:18080' }
    }
  }
})
