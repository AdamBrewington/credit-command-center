import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/credit-command-center/',  // matches your GitHub repo name
  build: {
    outDir: 'dist',
  },
})
