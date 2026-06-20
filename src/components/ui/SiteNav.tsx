import { Link } from '@tanstack/react-router'

export function SiteNav() {
  return (
    <nav className="nav">
      <Link to="/" className="nav__brand">
        Construca
      </Link>
      <div className="nav__links">
        <Link to="/map" className="nav__link">
          Map
        </Link>
        <Link to="/product" className="nav__link">
          Product
        </Link>
      </div>
    </nav>
  )
}
