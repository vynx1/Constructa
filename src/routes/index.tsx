import { createFileRoute, Link } from '@tanstack/react-router'
import { HeroCanvas } from '~/components/landing/HeroCanvas'
import { ComplianceCards } from '~/components/landing/ComplianceCards'
import { USMapTeaser } from '~/components/landing/USMapTeaser'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

// YC-style feature highlights — three pillars of the product.
const FEATURES = [
  {
    kicker: 'Find',
    title: 'Winning land, ranked',
    body: 'Overlay development pressure, zoning, permit velocity, and land cost across the country to surface where building actually pencils out.',
  },
  {
    kicker: 'Stake',
    title: 'Instant feasibility',
    body: 'Click any parcel to claim it and run a pre-check — surrounding aging stock, revitalization upside, and the regimes you’ll face.',
  },
  {
    kicker: 'Build',
    title: 'Compliance on autopilot',
    body: 'A live 10-step sequence shows exactly which conditions are active at each phase, so crews never idle and inspection windows never slip.',
  },
]

// Page 1 — Landing (the YC-grade hero).
// 100% client-side, no backend dependency.
function LandingPage() {
  return (
    <main className="landing">
      {/* Hero — the rotatable 3D apartment district sits behind the copy,
          full-bleed, blended into the page with a scrim for legibility. */}
     <section className="hero">
      <div className="hero__visual">
        <HeroCanvas />
      </div>
      
      <div className="hero__scrim" aria-hidden />
      
      {/* 1. Let mouse events pass THROUGH the invisible full-screen wrapper */}
      <div className="hero__inner pointer-events-none">
        
        {/* 2. Shrink container to content width, and re-enable mouse events for the text */}
        <div className="hero__copy w-fit pointer-events-auto">
          
          <span className="hero__eyebrow">AI construction foreman</span>
          
          {/* 3. Optional: Ensure the title/paragraph don't stretch artificially */}
          <h1 className="hero__title max-w-max">
            Build faster where the&nbsp;rules are hardest.
          </h1>
          <p className="hero__sub max-w-max">
            Construca turns California’s tangle of compliance regimes into
            something autonomous agents collect, classify, and file — so the
            only bottleneck left is how fast you can pour.
          </p>
          
          <div className="hero__cta">
            <Link to="/product" className="btn btn--primary">
              Get started
            </Link>
            <Link to="/map" className="btn btn--ghost">
              Find your land
            </Link>
          </div>
          
          <div className="hero__proof">
            <span>Cal/OSHA</span>
            <span>Title 24</span>
            <span>CEQA</span>
            <span>DSA</span>
            <span>SWPPP</span>
          </div>
          
        </div>
      </div>
    </section>

      {/* Feature pillars */}
      <section className="section">
        <p className="section__eyebrow">Why Construca</p>
        <h2 className="section__title">
          The land-to-launch loop, compressed.
        </h2>
        <div className="features">
          {FEATURES.map((f) => (
            <article key={f.kicker} className="feature">
              <span className="feature__kicker">{f.kicker}</span>
              <h3 className="feature__title">{f.title}</h3>
              <p className="feature__body">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* National map teaser */}
      <section className="section section--map">
        <div className="map-teaser">
          <div className="map-teaser__copy">
            <p className="section__eyebrow">National land intelligence</p>
            <h2 className="section__title">
              See where the next development wins.
            </h2>
            <p className="map-teaser__body">
              Every market scored on development pressure, permit velocity, and
              land cost — then re-skinned for AI data-center siting. Hover the
              map to preview a market; open the full map to fly into any county.
            </p>
            <Link to="/map" className="btn btn--primary">
              Explore the map
            </Link>
          </div>
          <USMapTeaser />
        </div>
      </section>

      {/* Compliance breakdown */}
      <section className="section">
        <p className="section__eyebrow">Coverage</p>
        <h2 className="section__title">What we keep compliant</h2>
        <ComplianceCards />
      </section>

      {/* How it works */}
      <section className="section">
        <p className="section__eyebrow">How it works</p>
        <h2 className="section__title">Three moves to a permitted build.</h2>
        <ol className="steps">
          <li>Find land on the national intelligence map.</li>
          <li>Stake a parcel for an instant feasibility pre-check.</li>
          <li>Run the live 10-step build with three AI agents.</li>
        </ol>
      </section>
    </main>
  )
}
