import { Link } from '@tanstack/react-router'

export function SiteNav() {
  return (
    <header className="nav-shell">
      <nav className="nav nav--command" aria-label="Main">
        <Link to="/" className="nav__brand">
          <span className="nav__brand-mark" aria-hidden />
          Construca
        </Link>

        <div className="nav__status font-mono" aria-live="polite">
          <span className="nav__status-dot" aria-hidden />
          3 agents active · CA compliance online
        </div>

        <div className="nav__links">
          <Link to="/map" className="nav__link">
            Map
          </Link>
          <Link to="/product" className="nav__link">
            Product
          </Link>
          <Link to="/product" className="btn btn--primary btn--sm nav__cta">
            Launch
          </Link>
        </div>
      </nav>
    </header>
  )
}
