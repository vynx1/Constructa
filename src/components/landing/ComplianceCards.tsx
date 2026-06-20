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
  icon: LucideIcon
  iconClass: string
}

const CATEGORIES: Category[] = [
  {
    title: 'Daily logs',
    body: 'Voice a site update, get a structured log.',
    icon: FileText,
    iconClass: 'text-slate-500',
  },
  {
    title: 'RFIs',
    body: 'Ask a compliance question, get a cited answer.',
    icon: MessageSquareCode,
    iconClass: 'text-blue-500',
  },
  {
    title: 'Cal/OSHA IIPP',
    body: 'Injury & illness prevention tracking.',
    icon: ShieldAlert,
    iconClass: 'text-orange-500',
  },
  {
    title: 'Title 24',
    body: 'Energy-code conditions at each phase.',
    icon: Zap,
    iconClass: 'text-yellow-500',
  },
  {
    title: 'CEQA',
    body: 'Environmental review obligations surfaced.',
    icon: Leaf,
    iconClass: 'text-green-500',
  },
  {
    title: 'DSA',
    body: 'Inspection windows scheduled in sequence.',
    icon: HardHat,
    iconClass: 'text-amber-600',
  },
  {
    title: 'SWPPP',
    body: 'Stormwater conditions tracked per step.',
    icon: Droplets,
    iconClass: 'text-cyan-500',
  },
]

function ComplianceCard({ title, body, icon: Icon, iconClass }: Category) {
  return (
    <article className="rounded-[10px] border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
      <div className="mb-3 flex items-start gap-3">
        <Icon
          className={`mt-0.5 h-5 w-5 shrink-0 ${iconClass}`}
          strokeWidth={1.75}
          aria-hidden
        />
        <h3 className="m-0 text-[1.05rem] font-semibold tracking-tight text-[#1a1916]">
          {title}
        </h3>
      </div>
      <p className="m-0 text-[0.92rem] leading-relaxed text-[#5c5850]">{body}</p>
    </article>
  )
}

export function ComplianceCards() {
  const topRow = CATEGORIES.slice(0, 4)
  const bottomRow = CATEGORIES.slice(4)

  return (
    <div className="mt-10 space-y-3">
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
