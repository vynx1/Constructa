import { useEffect, useState } from 'react'
import { X, Check, ClipboardList, ShieldCheck, AlertCircle } from 'lucide-react'

// #5 — "Completed work" tab. A serpentine (left→right→down→right→left) timeline
// of cleared compliance work with status, plus the bank of completed compliance,
// daily logs, and open items. Reads the central project-data record (spec §4).

interface SolvedCompliance { id: string; at: string; title: string; stage: string; pdfDataUrl?: string }
interface DailyLog { id: string; at: string; stage: string; text: string }
interface Problem { id: string; at: string; stage: string; summary: string; resolved: boolean }
interface ProjectData {
  solvedCompliance: SolvedCompliance[]
  logs: DailyLog[]
  problems: Problem[]
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const mins = Math.round((Date.now() - d) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

interface Props {
  projectId: string
  open: boolean
  refreshKey: number
  onClose: () => void
}

export function CompletedWork({ projectId, open, refreshKey, onClose }: Props) {
  const [data, setData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/project/${projectId}/data`)
      .then((r) => r.json())
      .then((d) =>
        setData({
          solvedCompliance: d.solvedCompliance ?? [],
          logs: d.logs ?? [],
          problems: d.problems ?? [],
        }),
      )
      .catch(() => setData({ solvedCompliance: [], logs: [], problems: [] }))
      .finally(() => setLoading(false))
  }, [open, projectId, refreshKey])

  if (!open) return null

  // Chronological order (the record stores newest-first).
  const solved = [...(data?.solvedCompliance ?? [])].reverse()
  const logs = data?.logs ?? []
  const openProblems = (data?.problems ?? []).filter((p) => !p.resolved)
  const rows = chunk(solved, 3)

  return (
    <div className="completed-work" role="dialog" aria-label="Completed work">
      <header className="completed-work__head">
        <span className="completed-work__title">
          <ClipboardList size={16} /> Completed work
        </span>
        <button className="completed-work__close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>

      <div className="completed-work__body">
        {/* Serpentine status timeline of cleared compliance. */}
        <section className="completed-work__section">
          <h4 className="completed-work__section-title">
            <ShieldCheck size={13} /> Compliance cleared
            <span className="completed-work__count">{solved.length}</span>
          </h4>
          {solved.length === 0 ? (
            <p className="completed-work__empty">
              Nothing cleared yet. Check items off in the timeline or let an agent
              auto-solve a stage — they’ll snake across here with a status.
            </p>
          ) : (
            <div className="snake">
              {rows.map((row, r) => (
                <div key={r} className={`snake-row${r % 2 ? ' snake-row--rev' : ''}`}>
                  {row.map((s, i) => (
                    <div key={s.id} className="snake-node">
                      <span className="snake-node__dot">
                        <Check size={12} />
                      </span>
                      <span className="snake-node__title">{s.title}</span>
                      <span className="snake-node__meta">
                        {s.stage} · {timeAgo(s.at)}
                      </span>
                      {s.pdfDataUrl && (
                        <a
                          href={s.pdfDataUrl}
                          download={`compliance-${s.stage}-${s.id}.pdf`}
                          className="snake-node__pdf-btn"
                          aria-label={`Download compliance PDF for ${s.title}`}
                        >
                          ↓ PDF
                        </a>
                      )}
                      {i < row.length - 1 && <span className="snake-node__link" />}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Daily logs bank. */}
        <section className="completed-work__section">
          <h4 className="completed-work__section-title">
            <ClipboardList size={13} /> Daily logs
            <span className="completed-work__count">{logs.length}</span>
          </h4>
          {logs.length === 0 ? (
            <p className="completed-work__empty">
              No site logs yet — use “Log daily work” to dictate one.
            </p>
          ) : (
            <ul className="completed-work__logs">
              {logs.map((l) => (
                <li key={l.id} className="log-entry">
                  <div className="log-entry__meta">
                    <span className="log-entry__stage">{l.stage}</span>
                    <span className="log-entry__time">{timeAgo(l.at)}</span>
                  </div>
                  <p className="log-entry__text">{l.text}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Open items bank. */}
        {openProblems.length > 0 && (
          <section className="completed-work__section">
            <h4 className="completed-work__section-title">
              <AlertCircle size={13} /> Open items
              <span className="completed-work__count">{openProblems.length}</span>
            </h4>
            <ul className="completed-work__open">
              {openProblems.map((p) => (
                <li key={p.id}>
                  <span className="completed-work__open-dot" />
                  {p.summary}
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading && !data && <p className="completed-work__empty">Loading record…</p>}
      </div>
    </div>
  )
}
