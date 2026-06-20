import { createFileRoute } from '@tanstack/react-router'
import { api } from '~/server/api'

// Catch-all server route: delegates every /api/* request to the Hono app.
// TanStack Start invokes these handlers server-side (no component on this route).
const handler = ({ request }: { request: Request }) => api.fetch(request)

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
      PUT: handler,
      PATCH: handler,
      DELETE: handler,
    },
  },
})
