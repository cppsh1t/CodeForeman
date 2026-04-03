import { useState, useCallback } from 'react'
import { useProjectList, usePlansForProject } from '@/hooks/use-planning'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAssistant } from './use-assistant'
import { ExecutionSummary } from './ExecutionSummary'
import { TaskProgress } from './TaskProgress'
import { Timeline } from './Timeline'
import { ForceThinkForm } from './ForceThinkForm'
import { ExecutionControls } from './ExecutionControls'

/**
 * AssistantPage — the assistant dashboard for monitoring and controlling plan execution.
 *
 * Provides:
 * - Project / plan selector for choosing which plan to monitor
 * - Execution summary: progress stats, current task, failure count
 * - Task progress: ordered list of tasks with status badges and duration
 * - Timeline: recent execution events from the latest task run
 * - Force Think: submit think decisions to influence execution flow
 * - Execution Controls: start / pause / resume / stop
 *
 * All data is read from persisted state via IPC. Auto-refreshes at 3s intervals
 * when the plan is in an active state (running/paused/blocked).
 */
export function AssistantPage({ planId: initialPlanId }: { planId?: number }): React.JSX.Element {
  // ── Project / Plan selection ──
  const { data: projectData, loading: projectsLoading } = useProjectList()
  const projects = projectData?.items ?? []
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  const { data: plansData, loading: plansLoading } = usePlansForProject(selectedProjectId)
  const plans = plansData?.items ?? []

  // ── Assistant data (fetched from persisted state) ──
  const assistant = useAssistant(initialPlanId)

  // ── Handlers ──

  const handleSelectProject = useCallback((value: string) => {
    const id = Number(value)
    setSelectedProjectId(id)
  }, [])

  const handleSelectPlan = useCallback(
    (value: string) => {
      const id = Number(value)
      assistant.changePlan(id)
    },
    [assistant]
  )

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Assistant</h1>
            <p className="text-xs/relaxed text-muted-foreground">
              Monitor execution, view timeline, and submit force-think decisions
            </p>
          </div>
          {assistant.plan && (
            <span className="text-xs text-muted-foreground">
              {assistant.plan.name} &middot; {assistant.planId}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-4xl space-y-4 p-6">
          {/* ── Plan Selector ── */}
          <Card size="sm">
            <CardContent className="py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {/* Project selector */}
                <div className="flex-1 space-y-1.5">
                  <label className="text-[0.625rem] font-medium text-muted-foreground uppercase tracking-wide">
                    Project
                  </label>
                  {projectsLoading ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : (
                    <Select
                      value={selectedProjectId?.toString() ?? ''}
                      onValueChange={handleSelectProject}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Plan selector */}
                <div className="flex-1 space-y-1.5">
                  <label className="text-[0.625rem] font-medium text-muted-foreground uppercase tracking-wide">
                    Plan
                  </label>
                  {plansLoading ? (
                    <p className="text-xs text-muted-foreground">Loading...</p>
                  ) : selectedProjectId == null ? (
                    <p className="text-xs text-muted-foreground">Select a project first</p>
                  ) : (
                    <Select
                      value={assistant.planId?.toString() ?? ''}
                      onValueChange={handleSelectPlan}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
                            <span className="ml-1 text-muted-foreground">({p.status})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ── Dashboard (only when plan selected) ── */}
          {assistant.planId != null && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Left column: summary + controls */}
              <div className="space-y-4">
                <ExecutionSummary
                  stats={assistant.stats}
                  planStatus={assistant.plan?.status}
                  planName={assistant.plan?.name}
                  loading={assistant.planLoading || assistant.tasksLoading}
                />

                <ExecutionControls
                  planStatus={assistant.plan?.status}
                  loading={assistant.controlLoading}
                  error={assistant.controlError}
                  onStart={assistant.executionStart}
                  onPause={assistant.executionPause}
                  onResume={assistant.executionResume}
                  onStop={assistant.executionStop}
                />
              </div>

              {/* Right column: task progress */}
              <TaskProgress
                tasks={assistant.tasks}
                taskRuns={assistant.taskRuns}
                loading={assistant.tasksLoading}
                error={assistant.tasksError}
              />
            </div>
          )}

          {/* ── Timeline ── */}
          {assistant.planId != null && (
            <Timeline
              messages={assistant.timelineMessages}
              loading={assistant.timelineLoading}
              error={assistant.timelineError}
            />
          )}

          {/* ── Force Think ── */}
          {assistant.planId != null && (
            <ForceThinkForm
              taskRuns={assistant.taskRuns}
              submitting={assistant.thinkSubmitting}
              error={assistant.thinkError}
              success={assistant.thinkSuccess}
              onSubmit={assistant.submitThink}
            />
          )}

          {/* ── Empty state ── */}
          {assistant.planId == null && (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">
                Select a project and plan to view execution status
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
