import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/tanstack-react-start'

// Publishable key is exposed to the browser via the VITE_ prefix.
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined

/**
 * Wraps the app in Clerk's provider when a publishable key is configured.
 * Without a key (e.g. fresh checkout / pure-frontend demo) it renders children
 * directly so the site still runs. Protected API routes enforce auth server-side.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!publishableKey) {
    return <>{children}</>
  }
  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>
}

export const isAuthConfigured = Boolean(publishableKey)
