import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  Link,
} from '@tanstack/react-router'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { AuthProvider } from '~/lib/clerk'
import { SiteNav } from '~/components/ui/SiteNav'
import appCss from '~/styles/app.css?url'

interface RouterContext {
  queryClient: QueryClient
}

function NotFound() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 57px)',
        gap: '1rem',
        fontFamily: 'var(--font-sans, sans-serif)',
        color: 'var(--ink-dark, #e2e8f0)',
        background: 'var(--bg-dark, #0b0f14)',
      }}
    >
      <span style={{ fontSize: '3rem', lineHeight: 1 }}>404</span>
      <p style={{ margin: 0, color: 'var(--ink-soft-dark, #94a3b8)' }}>
        This page doesn't exist.
      </p>
      <Link
        to="/"
        style={{
          padding: '0.4rem 1rem',
          borderRadius: '8px',
          background: 'var(--teal, #01696f)',
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

export const Route = createRootRouteWithContext<RouterContext>()({
  notFoundComponent: NotFound,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Constructa — AI construction foreman + land intelligence' },
      {
        name: 'description',
        content:
          'AI construction foreman and land-intelligence platform for heavily regulated states.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <SiteNav />
          <Outlet />
        </QueryClientProvider>
      </AuthProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
