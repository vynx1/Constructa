import type { LucideIcon } from 'lucide-react'
import {
  Droplets,
  FileText,
  HardHat,
  Leaf,
  MessageSquareCode,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { useState, type CSSProperties } from 'react'

interface Category {
  id: string
  title: string
  titleFull?: string
  summary: string
  bullets: [string, string, string]
  tag: string
  icon: LucideIcon
  accent: string
  visual: 'logs' | 'rfi' | 'osha' | 'energy' | 'ceqa' | 'dsa' | 'swppp'
  aside: { label: string; value: string }[]
}

const CATEGORIES: Category[] = [
  {
    id: 'logs',
    title: 'Daily logs',
    summary: 'Voice a site update, get a structured log.',
    bullets: [
      'Crew voice notes transcribed into inspector-ready daily reports',
      'Weather, manpower, and delivery entries auto-timestamped per shift',
      'Photos and punch items linked to the correct build phase automatically',
    ],
    tag: 'FIELD OPS',
    icon: FileText,
    accent: '#94a3b8',
    visual: 'logs',
    aside: [
      { label: 'Capture', value: 'Voice · Photo · Text' },
      { label: 'Output', value: 'Signed daily log PDF' },
      { label: 'Sync', value: 'Same-day GC inbox' },
    ],
  },
  {
    id: 'rfi',
    title: 'RFIs',
    titleFull: 'Requests for Information',
    summary: 'Ask a compliance question, get a cited answer.',
    bullets: [
      'Natural-language questions routed to the right code section',
      'Responses cite California Building Code, local amendments, and plan notes',
      'RFI threads stay attached to the parcel and build sequence',
    ],
    tag: 'RFI DESK',
    icon: MessageSquareCode,
    accent: '#22d3ee',
    visual: 'rfi',
    aside: [
      { label: 'Sources', value: 'CBC · Local · Plans' },
      { label: 'Turnaround', value: 'Under 2 min draft' },
      { label: 'Audit', value: 'Full citation trail' },
    ],
  },
  {
    id: 'osha',
    title: 'Cal/OSHA IIPP',
    titleFull: 'Injury & Illness Prevention Program',
    summary: 'Injury & illness prevention tracking.',
    bullets: [
      'Site-specific IIPP checklists generated for each active phase',
      'Toolbox talk records and hazard logs stored per superintendent',
      'Incident near-miss capture triggers required follow-up tasks',
    ],
    tag: 'SAFETY · IIPP',
    icon: ShieldAlert,
    accent: '#fb923c',
    visual: 'osha',
    aside: [
      { label: 'Standard', value: 'Cal/OSHA Title 8' },
      { label: 'Cadence', value: 'Weekly + phase gates' },
      { label: 'Escalation', value: 'Auto GC alert' },
    ],
  },
  {
    id: 'title24',
    title: 'Title 24',
    titleFull: 'California Energy Code',
    summary: 'Energy-code conditions at each phase.',
    bullets: [
      'Envelope, HVAC, and lighting specs checked against Part 6 at each step',
      'Mixed-use load splits modeled for retail base + residential upper floors',
      'Rooftop PV sizing validated against modeled annual consumption',
    ],
    tag: 'TITLE 24 · ENERGY',
    icon: Zap,
    accent: '#fbbf24',
    visual: 'energy',
    aside: [
      { label: 'Scope', value: 'Part 6 · PV · Envelope' },
      { label: 'Trigger', value: 'Every build phase' },
      { label: 'Deliverable', value: 'CF1R-ready packet' },
    ],
  },
  {
    id: 'ceqa',
    title: 'CEQA',
    titleFull: 'California Environmental Quality Act',
    summary: 'Environmental review obligations surfaced.',
    bullets: [
      'Initial study thresholds flagged before grading or demolition starts',
      'Biological, noise, and traffic impact categories mapped to your site',
      'Mitigation measures tracked through construction close-out',
    ],
    tag: 'CEQA · ENV',
    icon: Leaf,
    accent: '#34d399',
    visual: 'ceqa',
    aside: [
      { label: 'Review', value: 'Initial study · MND' },
      { label: 'Watch', value: 'Species · Noise · Traffic' },
      { label: 'Close-out', value: 'Mitigation log' },
    ],
  },
  {
    id: 'dsa',
    title: 'DSA',
    titleFull: 'Division of the State Architect',
    summary: 'Inspection windows scheduled in sequence.',
    bullets: [
      'Structural and accessibility inspection holds placed on the master schedule',
      'Required submittals queued before each DSA field visit',
      'Failed inspection rework tasks assigned back to the responsible trade',
    ],
    tag: 'DSA · INSPECT',
    icon: HardHat,
    accent: '#f59e0b',
    visual: 'dsa',
    aside: [
      { label: 'Jurisdiction', value: 'DSA · Field ops' },
      { label: 'Lead time', value: '10-day window buffer' },
      { label: 'Status', value: 'Live hold calendar' },
    ],
  },
  {
    id: 'swppp',
    title: 'SWPPP',
    titleFull: 'Stormwater Pollution Prevention Plan',
    summary: 'Stormwater conditions tracked per step.',
    bullets: [
      'Rain-event BMP checks scheduled against forecast and site phase',
      'Erosion control inspections logged with photo evidence',
      'WQMP conditions tied to grading, vertical, and close-out milestones',
    ],
    tag: 'SWPPP · H2O',
    icon: Droplets,
    accent: '#67e8f9',
    visual: 'swppp',
    aside: [
      { label: 'Trigger', value: 'Rain · Disturbed acreage' },
      { label: 'BMPs', value: 'Silt · Inlet · Stockpile' },
      { label: 'Reporting', value: 'QSP-ready export' },
    ],
  },
]

function ComplianceVisual({ type, accent }: { type: Category['visual']; accent: string }) {
  const glow = `${accent}33`

  switch (type) {
    case 'logs':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <rect x="40" y="20" width="120" height="100" rx="8" fill="#111820" stroke={accent} strokeWidth="1.5" />
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x="55" y={35 + i * 18} width={90 - i * 8} height="8" rx="2" fill={glow} />
          ))}
          <circle cx="155" cy="35" r="12" fill={accent} opacity="0.85" />
        </svg>
      )
    case 'rfi':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <rect x="30" y="30" width="140" height="80" rx="10" fill="#111820" stroke={accent} strokeWidth="1.5" />
          <path d="M55 55h90M55 72h70M55 89h50" stroke={accent} strokeWidth="2" opacity="0.6" />
          <path d="M145 95l15 15-8 8-15-15z" fill={accent} opacity="0.7" />
        </svg>
      )
    case 'osha':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <path d="M100 25 L165 55 V95 L100 125 L35 95 V55 Z" fill="#111820" stroke={accent} strokeWidth="1.5" />
          <path d="M100 50 V90M80 70h40" stroke={accent} strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'energy':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <rect x="50" y="40" width="100" height="70" rx="4" fill="#111820" stroke={accent} strokeWidth="1.5" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={58 + i * 30} y="48" width="22" height="40" rx="2" fill={accent} opacity={0.35 + i * 0.15} />
          ))}
          <path d="M100 25 L115 55 H105 L110 85 L85 50 H98 Z" fill={accent} />
        </svg>
      )
    case 'ceqa':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <ellipse cx="100" cy="95" rx="70" ry="18" fill={glow} />
          <path d="M100 30 C70 55 65 85 100 110 C135 85 130 55 100 30Z" fill="#111820" stroke={accent} strokeWidth="1.5" />
          <path d="M100 45 V95" stroke={accent} strokeWidth="2" opacity="0.5" />
        </svg>
      )
    case 'dsa':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <rect x="70" y="35" width="60" height="75" fill="#111820" stroke={accent} strokeWidth="1.5" />
          <path d="M85 35 V25 H115 V35" stroke={accent} strokeWidth="2" fill="none" />
          <rect x="88" y="75" width="24" height="35" fill={glow} />
          <rect x="55" y="55" width="20" height="55" fill={accent} opacity="0.25" />
          <rect x="125" y="50" width="20" height="60" fill={accent} opacity="0.25" />
        </svg>
      )
    case 'swppp':
      return (
        <svg viewBox="0 0 200 140" className="compliance-visual__svg" aria-hidden>
          <path d="M30 100 Q100 70 170 100" stroke={accent} strokeWidth="2" fill="none" opacity="0.5" />
          {[0, 1, 2, 3, 4].map((i) => (
            <ellipse
              key={i}
              cx={45 + i * 28}
              cy={88 - (i % 2) * 8}
              rx="8"
              ry="12"
              fill={accent}
              opacity={0.35 + (i % 3) * 0.15}
            />
          ))}
          <rect x="60" y="40" width="80" height="8" rx="2" fill={accent} opacity="0.6" />
        </svg>
      )
    default:
      return null
  }
}

export function ComplianceExplorer() {
  const [activeId, setActiveId] = useState(CATEGORIES[0]!.id)
  const active = CATEGORIES.find((c) => c.id === activeId) ?? CATEGORIES[0]!
  const ActiveIcon = active.icon

  return (
    <div className="compliance-explorer">
      <div className="compliance-explorer__tabs" role="tablist" aria-label="Compliance coverage">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon
          const isActive = cat.id === activeId
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`compliance-tab ${isActive ? 'compliance-tab--active' : ''}`}
              onClick={() => setActiveId(cat.id)}
            >
              <span
                className="compliance-tab__ring"
                style={{ boxShadow: isActive ? `0 0 12px ${cat.accent}` : undefined, background: cat.accent }}
              />
              <Icon className="compliance-tab__icon" style={{ color: cat.accent }} strokeWidth={1.75} />
              <span className="compliance-tab__label">{cat.title}</span>
            </button>
          )
        })}
      </div>

      <div
        className="compliance-explorer__stage"
        role="tabpanel"
        aria-label={active.title}
        style={{ '--compliance-accent': active.accent } as CSSProperties}
      >
        <div className="compliance-explorer__visual">
          <ComplianceVisual type={active.visual} accent={active.accent} />
        </div>

        <div className="compliance-explorer__detail">
          <p className="compliance-explorer__tag font-mono">{active.tag}</p>
          <div className="compliance-explorer__title-row">
            <ActiveIcon style={{ color: active.accent }} strokeWidth={1.75} aria-hidden />
            <h3 className="compliance-explorer__title">
              {active.title}
              {active.titleFull && (
                <span className="compliance-explorer__title-full"> ({active.titleFull})</span>
              )}
            </h3>
          </div>
          <p className="compliance-explorer__summary">{active.summary}</p>
          <ul className="compliance-explorer__bullets">
            {active.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <aside className="compliance-explorer__aside" aria-label={`${active.title} details`}>
          <p className="compliance-explorer__aside-title font-mono">At a glance</p>
          <dl className="compliance-explorer__aside-list">
            {active.aside.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="compliance-explorer__status font-mono">
            <span className="compliance-explorer__status-dot" />
            Tracked across every build phase
          </p>
        </aside>
      </div>
    </div>
  )
}
