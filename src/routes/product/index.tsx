import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Loader2, Boxes, ClipboardList } from 'lucide-react'
import { ModelViewer } from '~/components/product/ModelViewer'
import { ProjectConsole, type GenPhase } from '~/components/product/ProjectConsole'
import { PropertyInsightCards } from '~/components/product/PropertyInsightCards'
import { ProjectTimeline } from '~/components/product/ProjectTimeline'
import { AgentDock } from '~/components/product/AgentDock'
import { CompletedWork } from '~/components/product/CompletedWork'
import { ComplianceCards } from '~/components/product/ComplianceCards'
import { HorizontalTimeline } from '~/components/product/HorizontalTimeline'
import { StageWorkflowDemo } from '~/components/product/StageWorkflowDemo'
import { scaffoldRegistry, type SceneGraph } from '~/lib/modelScaffold'
import { STAGE_TO_MESH, type ExecutionPlan, type PlanStage, type AgentKey } from '~/lib/planTypes'
import { projectClient, type CachedDeepDive } from '~/lib/projectClient'

// Agent button key -> /api/agents/* endpoint (for auto-solve).
const AGENT_ENDPOINT: Partial<Record<AgentKey, string>> = {
  compliance: 'compliance',
  'permit-research': 'permit-research',
  hazards: 'hazards',
}

export const Route = createFileRoute('/product/')({
  component: ProductPage,
})

// Page 3 — the ultimate project workflow.
//  Phase 1 (intake):  left console to start a project · right property analysis.
//  Phase 2 (workspace): the generated 3D model + the optimized vertical timeline
//                       + the 6 agent quick-buttons.
function ProductPage() {
  const [cached, setCached] = useState<CachedDeepDive | null>(null)
  const [phase, setPhase] = useState<'intake' | 'workspace'>('intake')
  const [genPhase, setGenPhase] = useState<GenPhase>('idle')

  const [projectId, setProjectId] = useState<string | null>(null)
  const [sceneGraph, setSceneGraph] = useState<SceneGraph | null>(null)
  const [sceneVersion, setSceneVersion] = useState(0)
  const [plan, setPlan] = useState<ExecutionPlan | null>(null)
  const [modelBusy, setModelBusy] = useState(false)

  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [focusMesh, setFocusMesh] = useState<string | null>(null)
  const [solved, setSolved] = useState<Set<string>>(() => new Set())
  const [recordOpen, setRecordOpen] = useState(false)
  const [recordRefresh, setRecordRefresh] = useState(0)
  const bumpRecord = useCallback(() => setRecordRefresh((n) => n + 1), [])

  // Pull the forward-cached deep-dive the map wrote before navigating here.
  useEffect(() => {
    setCached(projectClient.cachedDeepDive())
  }, [])

  const district = cached?.regionId ?? null
  const districtLabel = cached?.regionLabel ?? null

  // --- Generation pipeline: instant scaffold → ASI model + 6-agent plan ------
  const generate = useCallback(
    async (idea: string) => {
      // 1. Instant deterministic scaffold so the canvas is never blank.
      setSceneGraph(scaffoldRegistry(idea))
      setSceneVersion((v) => v + 1)
      setPhase('workspace')
      setGenPhase('model')
      setPlan(null)
      setActiveStage(null)
      setFocusMesh(null)

      // 2. Create the project (seeds the central Redis data the agents read).
      let id = projectId
      try {
        if (!id) {
          const created = await projectClient.create({ idea, district })
          id = created.id
          setProjectId(id)
        }
      } catch {
        id = id ?? 'demo'
        setProjectId(id)
      }

      // 3. Model + plan in parallel — ASI:One authors the model while the six
      //    agents draft the execution plan.
      const modelP = projectClient
        .generateModel(id!, { idea, district })
        .then((r) => {
          setSceneGraph(r.model)
          setSceneVersion((v) => v + 1)
        })
        .catch(() => {})

      setGenPhase('plan')
      const planP = projectClient
        .generatePlan(id!, { idea, district })
        .then((r) => setPlan(r.plan))
        .catch(() => {})

      await Promise.allSettled([modelP, planP])
      setGenPhase('done')
      // Compliance workflow is required first — open it automatically.
      setActiveStage('compliance-workflow')
      setFocusMesh(STAGE_TO_MESH['compliance-workflow'] ?? null)
    },
    [projectId, district],
  )

  // Stage selection drives the camera (stage → mesh group).
  const onSelectStage = useCallback((stageKey: string) => {
    setActiveStage(stageKey)
    setFocusMesh(STAGE_TO_MESH[stageKey] ?? null)
  }, [])

  // Agent buttons also focus a mesh group (without changing the active stage).
  const onFocusMesh = useCallback((mesh: string) => setFocusMesh(mesh), [])

  const onSolve = useCallback(
    (stage: PlanStage, item: string) => {
      const key = `${stage.key}:${item}`
      let nowSolved = false
      setSolved((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else {
          next.add(key)
          nowSolved = true
        }
        return next
      })
      if (projectId && nowSolved) {
        projectClient
          .solveCompliance({ projectId, title: item, stage: stage.key })
          .then(bumpRecord)
          .catch(() => {})
      }
    },
    [projectId, bumpRecord],
  )

  // #4 — an agent auto-solves a whole stage's compliance via the autosolve
  // endpoint which calls ASI:One AND generates a compliance PDF certificate.
  const onAutoSolve = useCallback(
    async (stage: PlanStage, agent: AgentKey): Promise<string> => {
      const pid = projectId ?? 'demo'
      const idea = sceneGraph?.buildingType ?? plan?.buildingType ?? ''

      // Mark solved optimistically so the UI doesn't feel sluggish.
      setSolved((prev) => {
        const next = new Set(prev)
        for (const item of stage.compliance) next.add(`${stage.key}:${item}`)
        return next
      })

      let answer = 'Agent completed.'
      try {
        // autosolve runs the agent + generates the compliance PDF in one call.
        const res = await projectClient.autosolve({
          projectId: pid,
          stage: stage.key,
          stageTitle: stage.title,
          item: stage.compliance[0] ?? stage.title,
          agent: AGENT_ENDPOINT[agent] ?? 'compliance',
          idea,
        })
        answer = res.answer
        // The PDF is already persisted server-side; bump the record drawer.
      } catch {
        // Fallback: record each item without a PDF.
        if (projectId) {
          for (const item of stage.compliance) {
            await projectClient
              .solveCompliance({
                projectId,
                title: item,
                stage: stage.key,
                reference: `auto-solved by ${agent}`,
              })
              .catch(() => {})
          }
        }
        answer = 'Agent completed (offline mode).'
      }

      bumpRecord()
      return answer
    },
    [projectId, sceneGraph, plan, bumpRecord],
  )

  // Model-edit agent button: regenerate the model (and refresh the plan).
  const onEditModel = useCallback(
    async (idea: string) => {
      if (!projectId) return
      setModelBusy(true)
      // Instant scaffold of the edited idea so the swap is never blank.
      setSceneGraph(scaffoldRegistry(idea))
      setSceneVersion((v) => v + 1)
      try {
        const [m, p] = await Promise.allSettled([
          projectClient.generateModel(projectId, { idea, district }),
          projectClient.generatePlan(projectId, { idea, district }),
        ])
        if (m.status === 'fulfilled') {
          setSceneGraph(m.value.model)
          setSceneVersion((v) => v + 1)
        }
        if (p.status === 'fulfilled') setPlan(p.value.plan)
      } finally {
        setModelBusy(false)
      }
    },
    [projectId, district],
  )

  const reset = useCallback(() => {
    setPhase('intake')
    setGenPhase('idle')
    setSceneGraph(null)
    setPlan(null)
    setActiveStage(null)
    setFocusMesh(null)
    setSolved(new Set())
  }, [])

  const buildingType = sceneGraph?.buildingType ?? plan?.buildingType ?? 'project'

  // --- Intake phase ---------------------------------------------------------
  if (phase === 'intake') {
    return (
      <main className="workflow workflow--intake">
        <ProjectConsole
          districtLabel={districtLabel}
          phase={genPhase}
          onGenerate={generate}
        />
        <PropertyInsightCards cached={cached} />
      </main>
    )
  }

  // --- Workspace phase ------------------------------------------------------
  return (
    <main className="workflow workflow--workspace">
      <header className="workspace__bar">
        <div className="workspace__id">
          <Boxes size={16} />
          <span className="workspace__type">{buildingType}</span>
          {districtLabel && <span className="workspace__district">· {districtLabel}</span>}
          <button
            className={`workspace__record-tab${recordOpen ? ' is-open' : ''}`}
            onClick={() => setRecordOpen((v) => !v)}
          >
            <ClipboardList size={13} /> Completed work
          </button>
          {genPhase !== 'done' && (
            <span className="workspace__gen">
              <Loader2 size={12} className="spin" />
              {genPhase === 'model' ? 'authoring model…' : 'agents planning…'}
            </span>
          )}
          {modelBusy && (
            <span className="workspace__gen">
              <Loader2 size={12} className="spin" /> regenerating…
            </span>
          )}
        </div>
        <button className="btn btn--ghost workspace__reset" onClick={reset}>
          <RotateCcw size={14} /> New project
        </button>
      </header>

      <div className="workspace__grid">
        <section className="workspace__model">
          <ModelViewer
            sceneGraph={sceneGraph}
            activeGroup={focusMesh}
            sceneVersion={sceneVersion}
          />
          <AgentDock
            projectId={projectId ?? 'demo'}
            activeStage={activeStage}
            modelBusy={modelBusy}
            onFocusMesh={onFocusMesh}
            onEditModel={onEditModel}
            onActivity={bumpRecord}
          />
        </section>

        <aside className="workspace__timeline">
          <ProjectTimeline
            plan={plan}
            activeStage={activeStage}
            onSelectStage={onSelectStage}
            solved={solved}
            onSolve={onSolve}
            onAutoSolve={onAutoSolve}
          />
        </aside>
      </div>

      <CompletedWork
        projectId={projectId ?? 'demo'}
        open={recordOpen}
        refreshKey={recordRefresh}
        onClose={() => setRecordOpen(false)}
      />

      <div className="workspace__below">
        <ComplianceCards
          plan={plan}
          projectId={projectId}
          activeStage={activeStage ?? ''}
          onSelectStage={onSelectStage}
        />

        <HorizontalTimeline
          plan={plan}
          activeStage={activeStage ?? ''}
          onSelectStage={onSelectStage}
        />

        <StageWorkflowDemo
          plan={plan}
          projectId={projectId ?? 'demo'}
          activeStage={activeStage ?? ''}
          onSelectStage={onSelectStage}
          onActivity={bumpRecord}
        />
      </div>
    </main>
  )
}
