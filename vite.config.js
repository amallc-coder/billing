import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// `base` defaults to '/' (Vercel/Netlify/local). For a GitHub Pages project
// site the deploy workflow sets VITE_BASE=/billing/ so assets resolve correctly.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
})
