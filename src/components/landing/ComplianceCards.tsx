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

interface Category {
  title: string
  body: string
  tag: string
  icon: LucideIcon
  iconClass: string
  ringClass: string
}

const CATEGORIES: Category[] = [
  {
    title: 'Daily logs',
    body: 'Voice a site update, get a structured log.',
    tag: 'FIELD OPS',
    icon: FileText,
    iconClass: 'text-slate-400',
    ringClass: 'telemetry-card__ring--slate',
  },
  {
    title: 'RFIs',
    body: 'Ask a compliance question, get a cited answer.',
    tag: 'RFI DESK',
    icon: MessageSquareCode,
    iconClass: 'text-cyan-400',
    ringClass: 'telemetry-card__ring--cyan',
  },
  {
    title: 'Cal/OSHA IIPP',
    body: 'Injury & illness prevention tracking.',
    tag: 'SAFETY · IIPP',
    icon: ShieldAlert,
    iconClass: 'text-orange-400',
    ringClass: 'telemetry-card__ring--orange',
  },
  {
    title: 'Title 24',
    body: 'Energy-code conditions at each phase.',
    tag: 'TITLE 24 · ENERGY',
    icon: Zap,
    iconClass: 'text-amber-400',
    ringClass: 'telemetry-card__ring--amber',
  },
  {
    title: 'CEQA',
    body: 'Environmental review obligations surfaced.',
    tag: 'CEQA · ENV',
    icon: Leaf,
    iconClass: 'text-emerald-400',
    ringClass: 'telemetry-card__ring--green',
  },
  {
    title: 'DSA',
    body: 'Inspection windows scheduled in sequence.',
    tag: 'DSA · INSPECT',
    icon: HardHat,
    iconClass: 'text-amber-500',
    ringClass: 'telemetry-card__ring--amber',
  },
  {
    title: 'SWPPP',
    body: 'Stormwater conditions tracked per step.',
    tag: 'SWPPP · H2O',
    icon: Droplets,
    iconClass: 'text-cyan-300',
    ringClass: 'telemetry-card__ring--cyan',
  },
]

function ComplianceCard({
  title,
  body,
  tag,
  icon: Icon,
  iconClass,
  ringClass,
}: Category) {
  return (
    <article className="telemetry-card group">
      <span className={`telemetry-card__ring ${ringClass}`} aria-hidden />
      <div className="telemetry-card__head">
        <Icon className={`telemetry-card__icon ${iconClass}`} strokeWidth={1.75} aria-hidden />
        <div>
          <p className="telemetry-card__tag font-mono">{tag}</p>
          <h3 className="telemetry-card__title">{title}</h3>
        </div>
      </div>
      <p className="telemetry-card__body">{body}</p>
    </article>
  )
}

export function ComplianceCards() {
  const topRow = CATEGORIES.slice(0, 4)
  const bottomRow = CATEGORIES.slice(4)

  return (
    <div className="telemetry-grid">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topRow.map((category) => (
          <ComplianceCard key={category.title} {...category} />
        ))}
      </div>
      <div className="flex justify-center">
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:w-[calc(75%-0.75rem)] lg:grid-cols-3">
          {bottomRow.map((category) => (
            <ComplianceCard key={category.title} {...category} />
          ))}
        </div>
      </div>
    </div>
  )
}
