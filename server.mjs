// Production server. Wraps the built TanStack Start fetch handler
// (dist/server/server.js) in a Node listener and serves the static client
// bundle (dist/client). Run after `npm run build` via `npm start`.
//
// Portable: works on any Node host (Docker, Fly, Render, Railway, a VM).
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import handler from './dist/server/server.js'

const app = new Hono()

// Serve hashed client assets and any other static files from the client build.
// serveStatic falls through (next) when a file isn't found, so SSR routes
// like /map and /product still reach the handler below.
app.use('/*', serveStatic({ root: './dist/client' }))

// Everything else -> TanStack Start SSR + the Hono /api/* routes.
app.all('*', (c) => handler.fetch(c.req.raw))

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Construca listening on http://localhost:${info.port}`)
})
