import { CheckCircle2, MousePointer2, Zap } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DemoBuildCanvas, DEMO_VIEW_HEIGHT } from '~/components/landing/DemoBuildCanvas'

type DemoPhase = 'map' | 'workspace' | 'typing' | 'assembly'

const PROMPT_TEXT =
  'A three-story mixed-use building with ground-floor retail and top-tier energy compliance.'

const CHAR_DELAY_MS = 52
const READ_PAUSE_MS = 1700
const TYPING_MS = PROMPT_TEXT.length * CHAR_DELAY_MS + READ_PAUSE_MS

/** Build animation completes ~5.4s into assembly; then we hold the finished scene. */
const ASSEMBLY_BUILD_MS = 6000
const FINAL_HOLD_MS = 7000

const PHASE_MS = {
  map: 3500,
  workspace: 1500,
  typing: TYPING_MS,
  assembly: ASSEMBLY_BUILD_MS + FINAL_HOLD_MS,
} as const

const CYCLE_MS = PHASE_MS.map + PHASE_MS.workspace + PHASE_MS.typing + PHASE_MS.assembly

const COMPLIANCE_BADGES = [
  {
    id: 'ceqa',
    label: 'CEQA',
    step: 1,
    description:
      'California Environmental Quality Act — reviews site impacts before grading begins.',
  },
  {
    id: 'title24',
    label: 'Title 24',
    step: 2,
    description:
      'Energy code compliance for envelope, retail systems, and rooftop solar output.',
  },
  {
    id: 'dsa',
    label: 'DSA',
    step: 3,
    description:
      'Division of the State Architect — structural and accessibility inspection gates.',
  },
] as const

function MapMockup({
  active,
  clicked,
  fading,
}: {
  active: boolean
  clicked: boolean
  fading: boolean
}) {
  return (
    <div
      className={`relative h-full min-h-0 overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-slate-100/80 transition-all duration-500 ease-in-out ${
        fading ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100'
      }`}
      aria-hidden={!active}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 400 280"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="demo-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="0.6"
            />
          </pattern>
        </defs>
        <rect width="400" height="280" fill="url(#demo-grid)" />
        <path
          d="M 40 220 Q 120 180 180 140 T 280 90"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.5"
        />
        <rect x="48" y="52" width="56" height="44" rx="2" fill="#e2e8f0" stroke="#cbd5e1" />
        <rect x="128" y="72" width="48" height="40" rx="2" fill="#e2e8f0" stroke="#cbd5e1" />
        <rect x="200" y="48" width="64" height="52" rx="2" fill="#e2e8f0" stroke="#cbd5e1" />
        <rect x="288" y="96" width="52" height="48" rx="2" fill="#e2e8f0" stroke="#cbd5e1" />
        <rect
          x="152"
          y="118"
          width="72"
          height="58"
          rx="3"
          fill={clicked ? '#fef3c7' : '#f8fafc'}
          stroke={clicked ? '#f59e0b' : '#94a3b8'}
          strokeWidth={clicked ? 2 : 1}
          className={clicked ? 'demo-parcel-glow' : ''}
        />
      </svg>

      {active && (
        <div
          className={`demo-cursor ${clicked ? 'demo-cursor--landed' : 'demo-cursor--moving'}`}
        >
          <MousePointer2 className="h-5 w-5 text-slate-800 drop-shadow-sm" strokeWidth={2} />
        </div>
      )}

      {clicked && (
        <span className="absolute left-[41%] top-[48%] inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/40" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
        </span>
      )}
    </div>
  )
}

function EnergyComplianceTab({ visible }: { visible: boolean }) {
  return (
    <div
      className={`absolute bottom-4 left-4 z-40 max-w-[19rem] transition-all duration-700 ease-out ${
        visible
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      role="dialog"
      aria-live="polite"
      aria-label="Top-tier energy compliance summary"
    >
      <div className="overflow-hidden rounded-xl border border-yellow-300/80 bg-white shadow-xl">
        <div className="flex items-center gap-2 border-b border-yellow-200/80 bg-gradient-to-r from-yellow-50 to-amber-50 px-3.5 py-2.5">
          <Zap className="h-4 w-4 shrink-0 text-yellow-600" strokeWidth={2} />
          <p className="m-0 text-[0.78rem] font-semibold tracking-tight text-[#1a1916]">
            Top-tier energy compliance
          </p>
        </div>
        <div className="space-y-2 px-3.5 py-3">
          <p className="m-0 text-[0.72rem] leading-relaxed text-[#5c5850]">
            Generated to meet Title 24 mixed-use standards — retail base load,
            residential envelope, and rooftop PV sized as one integrated system.
          </p>
          <ul className="m-0 list-none space-y-1.5 p-0 text-[0.68rem] leading-snug text-[#1a1916]">
            <li className="flex gap-2">
              <span className="text-green-600">✓</span>
              <span>High-performance glazing &amp; insulated shell on upper floors</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600">✓</span>
              <span>Ground-floor retail HVAC zoned for lower peak demand</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600">✓</span>
              <span>Rooftop solar array offsetting ~85% of modeled annual use</span>
            </li>
            <li className="flex gap-2">
              <span className="text-green-600">✓</span>
              <span>Title 24 Part 6 documentation auto-filed at each build phase</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function ProjectIntakePanel({
  children,
  pulsing = false,
}: {
  children?: ReactNode
  pulsing?: boolean
}) {
  return (
    <div className="flex h-full flex-col">
      <label className="mb-2 block shrink-0 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#c8553d]">
        Project intake
      </label>
      <div
        className={`flex min-h-0 flex-1 flex-col rounded-xl border px-4 py-3 transition-all duration-500 ease-in-out ${
          pulsing
            ? 'demo-input-pulse border-[#c8553d]/40 bg-white'
            : 'border-slate-200/80 bg-slate-50/50'
        }`}
      >
        <div className="min-h-0 flex-1 overflow-auto font-mono text-[0.92rem] leading-relaxed text-[#1a1916]">
          {children}
        </div>
      </div>
    </div>
  )
}

function ComplianceOverlay({ visibleStep }: { visibleStep: number }) {
  return (
    <aside className="pointer-events-none absolute -right-1 top-3 z-30 flex w-[min(100%,17rem)] flex-col gap-2.5 sm:-right-3 md:-right-5 lg:-right-8">
      <p className="m-0 rounded-lg border border-slate-200/80 bg-white/95 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#c8553d] shadow-md backdrop-blur-sm">
        Compliance workflow
      </p>
      <ul className="m-0 list-none space-y-2.5 p-0">
        {COMPLIANCE_BADGES.map((badge) => {
          const visible = visibleStep >= badge.step
          return (
            <li
              key={badge.id}
              className={`rounded-xl border bg-white/95 px-3.5 py-3 shadow-lg backdrop-blur-sm transition-all duration-500 ease-in-out ${
                visible
                  ? 'translate-x-0 border-green-200/90 opacity-100'
                  : 'translate-x-6 border-transparent opacity-0'
              }`}
            >
              <div className="flex items-start gap-2">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    visible ? 'text-green-600' : 'text-slate-300'
                  }`}
                  strokeWidth={2}
                />
                <div>
                  <p className="m-0 text-sm font-semibold tracking-tight text-[#1a1916]">
                    {badge.label}
                  </p>
                  <p className="mt-1 mb-0 text-[0.72rem] leading-snug text-[#5c5850]">
                    {badge.description}
                  </p>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}

export function InteractiveMiniDemo() {
  const [phase, setPhase] = useState<DemoPhase>('map')
  const [mapClicked, setMapClicked] = useState(false)
  const [typedText, setTypedText] = useState('')
  const [showBuild, setShowBuild] = useState(false)
  const [buildStep, setBuildStep] = useState(0)
  const [badgeStep, setBadgeStep] = useState(0)
  const [holdFinal, setHoldFinal] = useState(false)
  const [showEnergyTab, setShowEnergyTab] = useState(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const queueTimer = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay)
    timersRef.current.push(id)
  }

  useEffect(() => {
    const runCycle = () => {
      clearTimers()
      setPhase('map')
      setMapClicked(false)
      setTypedText('')
      setShowBuild(false)
      setBuildStep(0)
      setBadgeStep(0)
      setHoldFinal(false)
      setShowEnergyTab(false)

      const assemblyStart = PHASE_MS.map + PHASE_MS.workspace + PHASE_MS.typing

      queueTimer(() => setMapClicked(true), PHASE_MS.map - 700)
      queueTimer(() => setPhase('workspace'), PHASE_MS.map)
      queueTimer(() => setPhase('typing'), PHASE_MS.map + PHASE_MS.workspace)
      queueTimer(() => setPhase('assembly'), assemblyStart)
      queueTimer(() => setShowBuild(true), assemblyStart + 400)

      const buildSteps = [
        { step: 1, badge: 1, at: assemblyStart + 600 },
        { step: 2, badge: 2, at: assemblyStart + 1800 },
        { step: 3, badge: 2, at: assemblyStart + 3000 },
        { step: 4, badge: 3, at: assemblyStart + 4200 },
        { step: 5, badge: 3, at: assemblyStart + 5400 },
      ]

      buildSteps.forEach(({ step, badge, at }) => {
        queueTimer(() => {
          setBuildStep(step)
          setBadgeStep(badge)
        }, at)
      })

      queueTimer(() => setHoldFinal(true), assemblyStart + ASSEMBLY_BUILD_MS)
      queueTimer(
        () => setShowEnergyTab(true),
        assemblyStart + ASSEMBLY_BUILD_MS + 400,
      )

      queueTimer(runCycle, CYCLE_MS)
    }

    runCycle()
    return clearTimers
  }, [])

  useEffect(() => {
    if (phase !== 'typing') return

    setTypedText('')
    let index = 0

    const interval = setInterval(() => {
      index += 1
      setTypedText(PROMPT_TEXT.slice(0, index))
      if (index >= PROMPT_TEXT.length) clearInterval(interval)
    }, CHAR_DELAY_MS)

    return () => clearInterval(interval)
  }, [phase])

  const showMap = phase === 'map'
  const showWorkspace = phase !== 'map'
  const mapFading = phase !== 'map'
  const typingComplete = typedText.length >= PROMPT_TEXT.length
  const workspaceHeader =
    phase === 'map'
      ? 'National parcel mesh'
      : 'Parcel #042-SD-CA // Initialization'

  return (
    <section
      className="border-t border-[#e2ddd4] bg-gradient-to-b from-[#f7f5f1] to-white"
      aria-label="Interactive product demo"
    >
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="section__eyebrow">Live preview</p>
        <h2 className="section__title mb-2 max-w-none">
          From parcel click to permitted assembly.
        </h2>
        <p className="m-0 max-w-2xl text-[1rem] leading-relaxed text-[#5c5850]">
          Map a parcel, describe the project, and watch Construca generate the
          build while compliance checkpoints attach in real time.
        </p>

        <div className="mt-7 overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-slate-200/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/90" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500/90" />
            </div>
            <p className="m-0 font-mono text-[0.78rem] font-medium tracking-tight text-slate-600 transition-all duration-500 ease-in-out">
              {workspaceHeader}
            </p>
            <span className="rounded-full border border-slate-200/80 px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-slate-500">
              Auto demo
            </span>
          </header>

          <div
            className="relative overflow-visible p-4"
            style={{ height: DEMO_VIEW_HEIGHT }}
          >
            <div
              className={`absolute inset-4 transition-all duration-500 ease-in-out ${
                showMap
                  ? 'z-20 translate-y-0 opacity-100'
                  : 'pointer-events-none z-0 translate-y-0 opacity-0'
              }`}
            >
              <MapMockup active={showMap} clicked={mapClicked} fading={mapFading} />
            </div>

            <div
              className={`relative h-full transition-all duration-500 ease-in-out ${
                showWorkspace
                  ? 'z-10 translate-y-0 opacity-100'
                  : 'pointer-events-none z-0 translate-y-4 opacity-0'
              }`}
            >
              {phase === 'typing' && (
                <ProjectIntakePanel>
                  {typedText}
                  {!typingComplete && (
                    <span className="demo-type-cursor ml-0.5 inline-block text-[#c8553d]">
                      |
                    </span>
                  )}
                </ProjectIntakePanel>
              )}

              {phase === 'assembly' && !showBuild && (
                <ProjectIntakePanel pulsing />
              )}

              {phase === 'assembly' && showBuild && (
                <div
                  className="relative isolate h-full overflow-visible pr-0 sm:pr-28 md:pr-36 lg:pr-44"
                >
                  <DemoBuildCanvas buildStep={buildStep} holdFinal={holdFinal} />
                  <ComplianceOverlay visibleStep={badgeStep} />
                  <EnergyComplianceTab visible={showEnergyTab} />
                </div>
              )}

              {phase === 'workspace' && (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <p className="m-0 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#c8553d]">
                      Workspace ready
                    </p>
                    <p className="mt-2 text-lg tracking-tight text-[#1a1916]">
                      Generating project shell…
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
