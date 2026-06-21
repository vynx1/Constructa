import { CheckCircle2, Zap } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { DemoBuildCanvas, DEMO_VIEW_HEIGHT } from '~/components/landing/DemoBuildCanvas'
import { DemoSouthwestMap, DEMO_CURSOR_TRAVEL_MS, MAP_HOLD_AFTER_CLICK_MS } from '~/components/landing/DemoSouthwestMap'
import { HudFrame } from '~/components/ui/HudFrame'

type DemoPhase = 'map' | 'workspace' | 'typing' | 'assembly'

const DEMO_PHASES = [
  { id: 'map' as const, num: '01', label: 'MAP' },
  { id: 'workspace' as const, num: '02', label: 'INIT' },
  { id: 'typing' as const, num: '03', label: 'INTAKE' },
  { id: 'assembly' as const, num: '04', label: 'ASSEMBLY' },
]

const PROMPT_TEXT =
  'A three-story mixed-use building with ground-floor retail and top-tier energy compliance.'

const CHAR_DELAY_MS = 52
const READ_PAUSE_MS = 1700
const TYPING_MS = PROMPT_TEXT.length * CHAR_DELAY_MS + READ_PAUSE_MS

const ASSEMBLY_BUILD_MS = 6000
const FINAL_HOLD_MS = 7000

const PHASE_MS = {
  map: DEMO_CURSOR_TRAVEL_MS + MAP_HOLD_AFTER_CLICK_MS,
  workspace: 1500,
  typing: TYPING_MS,
  assembly: ASSEMBLY_BUILD_MS + FINAL_HOLD_MS,
} as const

const CYCLE_MS = PHASE_MS.map + PHASE_MS.workspace + PHASE_MS.typing + PHASE_MS.assembly

const PHASE_OFFSET = {
  map: 0,
  workspace: PHASE_MS.map,
  typing: PHASE_MS.map + PHASE_MS.workspace,
  assembly: PHASE_MS.map + PHASE_MS.workspace + PHASE_MS.typing,
} as const

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
      <div className="overflow-hidden rounded-xl border border-amber-400/30 bg-[#111820]/95 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2 border-b border-amber-400/20 bg-gradient-to-r from-amber-500/10 to-orange-500/5 px-3.5 py-2.5">
          <Zap className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={2} />
          <p className="m-0 text-[0.78rem] font-semibold tracking-tight text-[#e8edf2]">
            Top-tier energy compliance
          </p>
        </div>
        <div className="space-y-2 px-3.5 py-3">
          <p className="m-0 text-[0.72rem] leading-relaxed text-[#8b9aab]">
            Generated to meet Title 24 mixed-use standards — retail base load,
            residential envelope, and rooftop PV sized as one integrated system.
          </p>
          <ul className="m-0 list-none space-y-1.5 p-0 text-[0.68rem] leading-snug text-[#c8d0dc]">
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>High-performance glazing &amp; insulated shell on upper floors</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Ground-floor retail HVAC zoned for lower peak demand</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Rooftop solar array offsetting ~85% of modeled annual use</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-400">✓</span>
              <span>Title 24 Part 6 documentation auto-filed at each build phase</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function DemoPhaseBar({
  activePhase,
  onSelect,
}: {
  activePhase: DemoPhase
  onSelect: (phase: DemoPhase) => void
}) {
  return (
    <div className="demo-phase-bar" aria-label="Demo phase">
      {DEMO_PHASES.map((step) => (
        <button
          key={step.id}
          type="button"
          className={`demo-phase-step ${activePhase === step.id ? 'demo-phase-step--active' : ''}`}
          aria-current={activePhase === step.id ? 'step' : undefined}
          onClick={() => onSelect(step.id)}
        >
          <span className="demo-phase-step__num">{step.num}</span>
          {step.label}
        </button>
      ))}
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
    <div className="demo-intake">
      <label className="demo-intake__label">Project intake</label>
      <div
        className={`demo-intake__field ${pulsing ? 'demo-intake__field--pulse' : ''}`}
      >
        <div className="demo-intake__text">{children}</div>
      </div>
    </div>
  )
}

function ComplianceOverlay({ visibleStep }: { visibleStep: number }) {
  return (
    <aside className="pointer-events-none absolute -right-1 top-3 z-30 flex w-[min(100%,17rem)] flex-col gap-2.5 sm:-right-3 md:-right-5 lg:-right-8">
      <p className="m-0 rounded-lg border border-white/10 bg-[#111820]/90 px-3 py-2 font-mono text-[0.62rem] font-semibold uppercase tracking-[0.1em] text-cyan-400 shadow-lg backdrop-blur-md">
        Compliance workflow
      </p>
      <ul className="m-0 list-none space-y-2.5 p-0">
        {COMPLIANCE_BADGES.map((badge) => {
          const visible = visibleStep >= badge.step
          return (
            <li
              key={badge.id}
              className={`rounded-xl border px-3.5 py-3 shadow-lg backdrop-blur-md transition-all duration-500 ease-in-out ${
                visible
                  ? 'translate-x-0 border-emerald-500/30 bg-[#111820]/92 opacity-100'
                  : 'translate-x-6 border-transparent opacity-0'
              }`}
            >
              <div className="flex items-start gap-2">
                <CheckCircle2
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    visible ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                  strokeWidth={2}
                />
                <div>
                  <p className="m-0 text-sm font-semibold tracking-tight text-[#e8edf2]">
                    {badge.label}
                  </p>
                  <p className="mt-1 mb-0 text-[0.72rem] leading-snug text-[#8b9aab]">
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
  const manualRef = useRef(false)

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }, [])

  const queueTimer = useCallback((fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay)
    timersRef.current.push(id)
  }, [])

  const resetVisualState = useCallback(() => {
    setMapClicked(false)
    setTypedText('')
    setShowBuild(false)
    setBuildStep(0)
    setBadgeStep(0)
    setHoldFinal(false)
    setShowEnergyTab(false)
  }, [])

  const scheduleAssemblyBuild = useCallback(
    (assemblyStart: number) => {
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
    },
    [queueTimer],
  )

  const scheduleFromOffset = useCallback(
    (offsetMs: number) => {
      const assemblyStart = PHASE_OFFSET.assembly

      const schedule = (fn: () => void, whenMs: number) => {
        if (whenMs >= 0) queueTimer(fn, whenMs)
      }

      schedule(() => setMapClicked(true), DEMO_CURSOR_TRAVEL_MS - offsetMs)
      schedule(() => setPhase('workspace'), PHASE_OFFSET.workspace - offsetMs)
      schedule(() => setPhase('typing'), PHASE_OFFSET.typing - offsetMs)
      schedule(() => setPhase('assembly'), assemblyStart - offsetMs)

      const msUntilAssembly = Math.max(0, assemblyStart - offsetMs)
      if (msUntilAssembly === 0 && offsetMs >= assemblyStart) {
        scheduleAssemblyBuild(0)
      } else {
        schedule(() => scheduleAssemblyBuild(0), msUntilAssembly)
      }

      schedule(() => {
        manualRef.current = false
        resetVisualState()
        setPhase('map')
        scheduleFromOffset(0)
      }, CYCLE_MS - offsetMs)
    },
    [queueTimer, resetVisualState, scheduleAssemblyBuild],
  )

  const applyPhaseInstant = useCallback(
    (target: DemoPhase) => {
      resetVisualState()
      setPhase(target)

      switch (target) {
        case 'map':
          break
        case 'workspace':
          setMapClicked(true)
          break
        case 'typing':
          setMapClicked(true)
          break
        case 'assembly':
          setMapClicked(true)
          setTypedText(PROMPT_TEXT)
          setShowBuild(true)
          setBuildStep(1)
          setBadgeStep(1)
          break
      }
    },
    [resetVisualState],
  )

  const jumpToPhase = useCallback(
    (target: DemoPhase) => {
      manualRef.current = true
      clearTimers()
      applyPhaseInstant(target)
      scheduleFromOffset(PHASE_OFFSET[target])
    },
    [applyPhaseInstant, clearTimers, scheduleFromOffset],
  )

  useEffect(() => {
    if (manualRef.current) return
    clearTimers()
    resetVisualState()
    setPhase('map')
    scheduleFromOffset(0)
    return clearTimers
  }, [clearTimers, resetVisualState, scheduleFromOffset])

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
      ? 'Southwest parcel mesh · San Diego sector'
      : 'Parcel #042-SD-CA // Initialization'

  return (
    <section className="demo-section reveal-section" aria-label="Interactive product demo">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <p className="section__eyebrow font-mono">Live preview</p>
        <h2 className="section__title section__title--wide mb-2">
          From parcel click to permitted assembly.
        </h2>
        <p className="m-0 max-w-2xl text-[1rem] leading-relaxed text-[var(--ink-soft)]">
          Map a parcel, describe the project, and watch Constructa generate the
          build while compliance checkpoints attach in real time.
        </p>

        <HudFrame className="mt-7" minimal>
          <div className="demo-shell__header demo-shell__header--minimal">
            <p className="demo-shell__title">{workspaceHeader}</p>
          </div>

          <DemoPhaseBar activePhase={phase} onSelect={jumpToPhase} />

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
              <DemoSouthwestMap active={showMap} clicked={mapClicked} fading={mapFading} />
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
                    <span className="demo-type-cursor ml-0.5 inline-block text-amber-400">
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
                    <p className="m-0 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-cyan-400">
                      Workspace ready
                    </p>
                    <p className="mt-2 text-lg tracking-tight text-[#e8edf2]">
                      Generating project shell…
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </HudFrame>
      </div>
    </section>
  )
}
