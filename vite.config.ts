/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Deployed to https://<user>.github.io/Habit-tracker/ — the base path must match
// the repo name. Override with BASE_PATH=/ for a root-domain deploy.
const base = process.env.BASE_PATH ?? '/Habit-tracker/'

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
