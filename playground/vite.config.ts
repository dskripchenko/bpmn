import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = resolve(import.meta.dirname, '..')

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [vue()],
  server: { port: 5340, fs: { allow: [root] } },
})
