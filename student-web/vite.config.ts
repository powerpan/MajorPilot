import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const executorOrigin=process.env.VITE_EXECUTOR_ORIGIN || 'http://127.0.0.1:15175'
if(process.env.VITE_PILOT_MODE==='true'){
  const origin=new URL(executorOrigin)
  if(origin.protocol!=='https:'||origin.origin!==executorOrigin||origin.username||origin.password)throw new Error('Pilot requires an exact HTTPS executor origin')
}
export default defineConfig({
  define: { __MP_EXECUTOR_ORIGIN__: JSON.stringify(executorOrigin) },
  plugins: [vue()],
  server: {
    host: 'localhost', port: 15173, strictPort: true,
    proxy: {
      '/api/public/v1': { target: 'http://127.0.0.1:18080' },
      '/api/app/v1': { target: 'http://127.0.0.1:18080' }
    }
  }
})
