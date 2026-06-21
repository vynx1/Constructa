import tailwindcss from '@tailwindcss/vite'
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
  // Browserbase + Playwright are server-only (dynamically imported in
  // src/lib/browserbase.ts) and ship native binaries (fsevents). Keep them out
  // of dep-optimization/bundling so the dev optimizer doesn't choke on them.
  optimizeDeps: {
    exclude: ['playwright-core', '@browserbasehq/sdk', 'fsevents'],
  },
  ssr: {
    external: ['playwright-core', '@browserbasehq/sdk'],
  },
  plugins: [
    tailwindcss(),
    // TanStack Start: file-based routing, SSR, server functions, Nitro output
    tanstackStart(),
    // React fast-refresh / JSX transform
    viteReact(),
  ],
})
