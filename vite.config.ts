import { readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'

// The icons are bundled (no `lucide-vue-next` at run time); their license goes with them.
const lucideLicense = readFileSync(resolve(import.meta.dirname, 'node_modules/lucide-vue-next/LICENSE'), 'utf8').trim()
const lucideBanner = `/*! Includes icons from lucide-vue-next (https://lucide.dev)\n${lucideLicense.replace(/\*\//g, '* /')}\n*/`

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: resolve(import.meta.dirname, 'tsconfig.vue.json'),
      entryRoot: resolve(import.meta.dirname, 'src'),
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.spec.ts'],
      // One declaration file per entry: no relative imports, so `nodenext` consumers resolve them too.
      bundleTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: { index: resolve(import.meta.dirname, 'src/index.ts'), vue: resolve(import.meta.dirname, 'src/vue/index.ts') },
      formats: ['es', 'cjs'],
      fileName: (format, entryAlias) => `${entryAlias}.${format === 'es' ? 'mjs' : 'cjs'}`,
      cssFileName: 'style',
    },
    rollupOptions: {
      external: ['vue', '@dskripchenko/ui'],
      output: {
        // The core shared by both entries.
        manualChunks: (id) => (id.includes('/src/') && !id.includes('/src/vue/') ? 'core' : undefined),
        postBanner: (chunk) => (chunk.isEntry && chunk.name === 'vue' ? lucideBanner : ''),
      },
    },
    minify: false,
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
  },
})
