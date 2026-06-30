import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Relative base so the built assets resolve from ANY static location
// (gh-pages branch, project Pages site, a CDN proxy, Vercel root). Combined
// with HashRouter this makes the app fully host-agnostic — no server rewrites.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  server: {
    port: 5173,
  },
})
