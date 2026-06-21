import { createRouter as createTanStackRouter, Link } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

function DefaultNotFound() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        background: '#0b0f14',
        color: '#e2e8f0',
        fontFamily: 'sans-serif',
      }}
    >
      <span style={{ fontSize: '3rem', lineHeight: 1 }}>404</span>
      <p style={{ margin: 0, color: '#94a3b8' }}>Page not found.</p>
      <Link
        to="/"
        style={{
          padding: '0.4rem 1rem',
          borderRadius: '8px',
          background: '#01696f',
          color: '#fff',
          textDecoration: 'none',
          fontSize: '0.85rem',
          fontWeight: 600,
        }}
      >
        Back to home
      </Link>
    </main>
  )
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
      },
    },
  })

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultNotFoundComponent: DefaultNotFound,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
