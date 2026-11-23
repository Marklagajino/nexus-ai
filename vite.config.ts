import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const allowedHosts = (process.env.NEXUS_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
