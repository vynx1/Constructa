import { useState, useEffect, useRef } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { HeroCanvas } from '~/components/landing/HeroCanvas'
import { ComplianceCards } from '~/components/landing/ComplianceCards'
import { InteractiveMiniDemo } from '~/components/landing/InteractiveMiniDemo'
import { USMapTeaser } from '~/components/landing/USMapTeaser'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

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

function LandingPage() {
  const demoRef = useRef<HTMLDivElement>(null)
  const [isDemoVisible, setIsDemoVisible] = useState(false)
  const [isAnimationFinished, setIsAnimationFinished] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsDemoVisible(true)
          observer.disconnect() 
        }
      },
      { rootMargin: '150px' }
    )

    if (demoRef.current) {
      observer.observe(demoRef.current)
    }

    return () => observer.disconnect()
  }, [])

  return (
    <main className="landing">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero__visual">
          <HeroCanvas />
        </div>
        <div className="hero__scrim" aria-hidden />
        <div className="hero__inner pointer-events-none">
          <div className="hero__copy w-fit pointer-events-auto">
            <span className="hero__eyebrow">AI construction foreman</span>
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
      <section className="section section--compact">
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
      <section className="section section--compact mx-auto max-w-7xl px-6">
        <p className="section__eyebrow">Coverage</p>
        <h2 className="section__title max-w-none">What we keep compliant</h2>
        <ComplianceCards />
      </section>

      {/* 3D Demo Section */}
      <section className="section relative border-t border-[var(--line)]">
        <div ref={demoRef} className="w-full min-h-[480px] relative">
          {isDemoVisible && (
            <InteractiveMiniDemo 
              onAnimationComplete={() => setIsAnimationFinished(true)} 
            />
          )}
          
          {isAnimationFinished && (
            <div className="absolute bottom-6 right-6 z-20 transition-all duration-500 ease-out animate-in fade-in slide-in-from-bottom-4">
              <Link to="/map" className="btn btn--primary shadow-xl hover:scale-105 transition-transform">
                Find Developable Land &rarr;
              </Link>
            </div>
          )}
        </div>
      </section>

{/* New Final Action Section */}
<section className="section border-t border-[var(--line)] bg-[var(--bg)]">
  <div className="text-center max-w-xl mx-auto mb-10">
    <h1 className="section__eyebrow">Get Started</h1>
  </div>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
    {/* Path A: Find Land */}
    {/* Changed items-start to items-center */}
    <div className="p-8 border border-[var(--line)] rounded-[var(--radius)] bg-[var(--surface)] flex flex-col justify-between items-center transition-all hover:shadow-md">
      {/* Added text-center here */}
      <div className="text-center">
        <span className="text-[var(--accent)] font-bold uppercase tracking-wider text-xs block mb-2">Market Discovery</span>
        <h3 className="text-xl font-bold mb-2 text-[var(--ink)]">Source New Canvas</h3>
        <p className="text-[var(--ink-soft)] text-sm leading-relaxed mb-6">
          Scan regional constraints, zoning data, and environmental pressures across counties to pinpoint high-velocity parcels.
        </p>
      </div>
      <Link to="/map" className="btn btn--primary w-full text-center">
        Find Developable Land
      </Link>
    </div>

    {/* Path B: Create Project */}
    {/* Changed items-start to items-center */}
    <div className="p-8 border border-[var(--line)] rounded-[var(--radius)] bg-[var(--surface)] flex flex-col justify-between items-center transition-all hover:shadow-md">
      {/* Added text-center here */}
      <div className="text-center">
        <span className="text-[var(--accent)] font-bold uppercase tracking-wider text-xs block mb-2">Compliance Engine</span>
        <h3 className="text-xl font-bold mb-2 text-[var(--ink)]">Onboard Existing Site</h3>
        <p className="text-[var(--ink-soft)] text-sm leading-relaxed mb-6">
          Already have an active site? Spin up a new blueprint timeline to sync autonomous agent processing directly with your field crew.
        </p>
      </div>
      <Link to="/product" className="btn btn--ghost w-full text-center hover:bg-[var(--bg)]">
        Create a Project
      </Link>
    </div>
  </div>
</section>
    </main>
  )
}