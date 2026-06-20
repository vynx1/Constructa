import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  server: {
    port: 3000,
  },
  // Vite 8 resolves TS path aliases (`~/*` -> `src/*`) natively.
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // TanStack Start: file-based routing, SSR, server functions, Nitro output
    tanstackStart(),
    // React fast-refresh / JSX transform
    viteReact(),
  ],
})
