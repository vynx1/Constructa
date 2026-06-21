import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Loader2, Boxes, ClipboardList } from 'lucide-react'
import { ModelViewer } from '~/components/product/ModelViewer'
import { ProjectConsole, type GenPhase } from '~/components/product/ProjectConsole'
import { PropertyInsightCards } from '~/components/product/PropertyInsightCards'
import { ProjectTimeline } from '~/components/product/ProjectTimeline'
import { AgentDock } from '~/components/product/AgentDock'
import { CompletedWork } from '~/components/product/CompletedWork'
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

  // #4 — an agent auto-solves a whole stage's compliance: run the agent, then
  // mark every compliance item on the stage cleared and record it.
  const onAutoSolve = useCallback(
    async (stage: PlanStage, agent: AgentKey): Promise<string> => {
      const endpoint = AGENT_ENDPOINT[agent] ?? 'compliance'
      const pid = projectId ?? 'demo'
      let answer = ''
      try {
        const res = await projectClient.agent(endpoint, {
          projectId: pid,
          stage: stage.key,
          question: `Resolve the ${stage.title} compliance for this project and tell me exactly what was filed.`,
        })
        answer = (res.answer as string) ?? 'Agent completed.'
      } catch {
        answer = 'Agent unreachable — try again.'
      }
      // Mark the stage's compliance items cleared.
      setSolved((prev) => {
        const next = new Set(prev)
        for (const item of stage.compliance) next.add(`${stage.key}:${item}`)
        return next
      })
      if (projectId) {
        // Sequential, not parallel: the server record is a read-modify-write,
        // so concurrent solves would race and only the last would persist.
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
            // #5 — turn the agent's solution into a downloadable compliance PDF
      // (filed under "Completed work") instead of surfacing raw markdown.
      let statusMsg = 'Compliance document generated — see Completed work.'
      try {
        const meta = await projectClient.generateCompliancePdf({
          projectId: pid,
          stage: stage.title,
          content: answer,
        })
        statusMsg = `Compliance document "${meta.filename}" filed under Completed work.`
      } catch {
        statusMsg = 'Stage resolved, but the compliance document could not be generated.'
      }
      bumpRecord()
      setRecordOpen(true)
      return statusMsg
    },
    [projectId, bumpRecord],
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
    </main>
  )
}