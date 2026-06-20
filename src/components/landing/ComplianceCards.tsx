import type { ReactNode } from 'react'

// Regulation categories the product solves. Each card carries an icon that is
// hidden at rest and animates in on hover (see `.card__icon` in app.css).
interface Category {
  title: string
  body: string
  icon: ReactNode
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

const CATEGORIES: Category[] = [
  {
    title: 'Daily logs',
    body: 'Voice a site update, get a structured log.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </svg>
    ),
  },
  {
    title: 'RFIs',
    body: 'Ask a compliance question, get a cited answer.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" />
        <path d="M12 16.5h.01" />
      </svg>
    ),
  },
  {
    title: 'Cal/OSHA IIPP',
    body: 'Injury & illness prevention tracking.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Title 24',
    body: 'Energy-code conditions at each phase.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
      </svg>
    ),
  },
  {
    title: 'CEQA',
    body: 'Environmental review obligations surfaced.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 21c5-3 8-7 8-11a8 8 0 0 0-16 0c0 4 3 8 8 11z" />
        <path d="M12 3c0 6 0 12 0 18" />
      </svg>
    ),
  },
  {
    title: 'DSA',
    body: 'Inspection windows scheduled in sequence.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M3 21h18" />
        <path d="M5 21V8l7-5 7 5v13" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    title: 'SWPPP',
    body: 'Stormwater conditions tracked per step.',
    icon: (
      <svg viewBox="0 0 24 24" {...stroke}>
        <path d="M12 3c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9z" />
      </svg>
    ),
  },
]

export function ComplianceCards() {
  return (
    <div className="cards">
      {CATEGORIES.map((c) => (
        <article key={c.title} className="card">
          <span className="card__icon" aria-hidden>
            {c.icon}
          </span>
          <h3 className="card__title">{c.title}</h3>
          <p className="card__body">{c.body}</p>
        </article>
      ))}
    </div>
  )
}
