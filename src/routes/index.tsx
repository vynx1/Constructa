import { createFileRoute, Link } from '@tanstack/react-router'
import { ComplianceExplorer } from '~/components/landing/ComplianceExplorer'
import { HeroCanvas } from '~/components/landing/HeroCanvas'
import { InteractiveMiniDemo } from '~/components/landing/InteractiveMiniDemo'
import { LandingScrollReveal } from '~/components/landing/LandingScrollReveal'
import { MapIntelFrame } from '~/components/landing/MapIntelFrame'
import { USMapTeaser } from '~/components/landing/USMapTeaser'
import { SectionDivider } from '~/components/ui/SectionDivider'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

const FEATURES = [
  {
    kicker: '01 · Find',
    title: 'Winning land, ranked',
    body: 'Overlay development pressure, zoning, permit velocity, and land cost across the country to surface where building actually pencils out.',
  },
  {
    kicker: '02 · Stake',
    title: 'Instant feasibility',
    body: 'Click any parcel to claim it and run a pre-check — surrounding aging stock, revitalization upside, and the regimes you’ll face.',
  },
  {
    kicker: '03 · Build',
    title: 'Compliance on autopilot',
    body: 'A live 10-step sequence shows exactly which conditions are active at each phase, so crews never idle and inspection windows never slip.',
  },
]

function LandingPage() {
  return (
    <main className="landing">
      <LandingScrollReveal />

      <section className="hero hero--command">
        {/* Midjourney slot: hero ambient plate — see prompt #1 */}
        <div className="mj-slot mj-slot--hero-plate" aria-hidden />

        <div className="hero__grid-overlay" aria-hidden />

        <div className="hero__visual">
          <HeroCanvas />
        </div>

        <div className="hero__scrim" aria-hidden />

        <div className="hero__inner pointer-events-none">
          <div className="hero__copy hud-glass pointer-events-auto">
            <span className="hero__eyebrow font-mono">
              <span className="hero__eyebrow-dot" aria-hidden />
              AI construction foreman
            </span>

            <h1 className="hero__title max-w-max">
              Build faster where the&nbsp;rules are hardest.
            </h1>
            <p className="hero__sub max-w-max">
              The build is the easy part. The permits never stop. Constructa's
              agents track what's due, prep your filings, and keep compliance
              moving—so work doesn't stall waiting on paperwork.
            </p>

            <div className="hero__cta">
              <Link to="/product" className="btn btn--glow">
                Get started
              </Link>
              <Link to="/map" className="btn btn--ghost-dark">
                Find your land
              </Link>
            </div>

            <div className="hero__proof font-mono">
              <span>OSHA</span>
              <span>Energy code</span>
              <span>Environmental review</span>
              <span>Building code</span>
              <span>SWPPP</span>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      <section className="section section--compact reveal-section">
        <p className="section__eyebrow font-mono">Why Constructa</p>
        <h2 className="section__title section__title--wide">
          The land-to-launch loop, compressed.
        </h2>
        <div className="features features--telemetry">
          {FEATURES.map((f) => (
            <article key={f.kicker} className="feature feature--telemetry">
              <span className="feature__kicker font-mono">{f.kicker}</span>
              <h3 className="feature__title">{f.title}</h3>
              <p className="feature__body">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      <SectionDivider />

      <section className="section section--map reveal-section">
        <div className="map-teaser">
          <div className="map-teaser__copy">
            <p className="section__eyebrow font-mono">National land intelligence</p>
            <h2 className="section__title section__title--wide">
              See where the next development wins.
            </h2>
            <p className="map-teaser__body">
              Every market scored on development pressure, permit velocity, and
              land cost. Click a metro in the list or on the map to pin intel —
              drag to rotate and scroll to zoom the 3D view.
            </p>
            <Link to="/map" className="btn btn--primary">
              Explore the map
            </Link>
          </div>
          <MapIntelFrame>
            <USMapTeaser />
          </MapIntelFrame>
        </div>
      </section>

      <SectionDivider />

      <section className="section section--compact section--compliance reveal-section mx-auto max-w-7xl px-6">
        {/* Midjourney slot: compliance blueprint texture — see prompt #3 */}
        <div className="mj-slot mj-slot--compliance-bg" aria-hidden />
        <p className="section__eyebrow font-mono">Coverage</p>
        <h2 className="section__title section__title--wide max-w-none">
          What we keep compliant
        </h2>
        <ComplianceExplorer />
      </section>

      <SectionDivider />

      <InteractiveMiniDemo />
    </main>
  )
}
