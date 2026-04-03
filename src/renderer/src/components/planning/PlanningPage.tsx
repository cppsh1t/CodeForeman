import { useState, useCallback } from 'react'
import {
  useProjectList,
  usePlansForProject,
  useMaterials,
  useTaskDrafts,
  isPlanEditable,
  materialTypeLabel,
  type PlanItem
} from '@/hooks/use-planning'
import { PlanDraftForm } from './PlanDraftForm'
import { MaterialsInput } from './MaterialsInput'
import { TaskDraftList } from './TaskDraftList'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'

export function PlanningPage(): React.JSX.Element {
  // ── Project state ──
  const { data: projectData, loading: projectsLoading, refetch: refetchProjects } = useProjectList()
  const projects = projectData?.items ?? []
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)

  // ── Plan state ──
  const {
    data: plansData,
    loading: plansLoading,
    refetch: refetchPlans
  } = usePlansForProject(selectedProjectId)
  const plans = plansData?.items ?? []
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)

  // ── New project creation ──
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectSaving, setNewProjectSaving] = useState(false)

  // ── Sub-resource fetching ──
  const { data: materials, refetch: refetchMaterials } = useMaterials(selectedPlanId)
  const { data: tasks, refetch: refetchTasks } = useTaskDrafts(selectedPlanId)

  // ── Mutation state ──
  const [planSaving, setPlanSaving] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)
  const [materialSaving, setMaterialSaving] = useState(false)
  const [materialError, setMaterialError] = useState<string | null>(null)
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskError, setTaskError] = useState<string | null>(null)

  // Derived: the currently selected plan object
  const currentPlan: PlanItem | null = plans.find((p) => p.id === selectedPlanId) ?? null

  const locked = currentPlan ? !isPlanEditable(currentPlan.status) : false

  // ── Handlers ──

  const handleCreateProject = useCallback(async () => {
    if (!newProjectName.trim()) return
    setNewProjectSaving(true)
    try {
      const res = await window.api.projectCreate({
        name: newProjectName.trim(),
        description: ''
      })
      if (res.ok) {
        setSelectedProjectId(res.data.id)
        setNewProjectName('')
        setShowNewProject(false)
        refetchProjects()
      }
    } catch (err) {
      console.error('Failed to create project:', err)
    } finally {
      setNewProjectSaving(false)
    }
  }, [newProjectName, refetchProjects])

  const handleSavePlan = useCallback(
    async (data: { name: string; description: string }): Promise<boolean> => {
      if (selectedProjectId == null) return false
      setPlanSaving(true)
      setPlanError(null)
      try {
        if (currentPlan) {
          // Update existing plan
          const res = await window.api.planUpdate({
            id: currentPlan.id,
            name: data.name,
            description: data.description
          })
          if (res.ok) {
            refetchPlans()
            return true
          }
          setPlanError(res.error.message)
          return false
        } else {
          // Create new plan
          const res = await window.api.planCreate({
            project_id: selectedProjectId,
            name: data.name,
            description: data.description
          })
          if (res.ok) {
            setSelectedPlanId(res.data.id)
            refetchPlans()
            return true
          }
          setPlanError(res.error.message)
          return false
        }
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : 'Failed to save plan')
        return false
      } finally {
        setPlanSaving(false)
      }
    },
    [selectedProjectId, currentPlan, refetchPlans]
  )

  const handleSetReady = useCallback(async (): Promise<boolean> => {
    if (!currentPlan) return false
    setPlanSaving(true)
    setPlanError(null)
    try {
      const res = await window.api.planSetReady({ id: currentPlan.id })
      if (res.ok) {
        refetchPlans()
        return true
      }
      setPlanError(res.error.message)
      return false
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to set plan ready')
      return false
    } finally {
      setPlanSaving(false)
    }
  }, [currentPlan, refetchPlans])

  const handleAddMaterial = useCallback(
    async (data: { type: string; content: string }): Promise<boolean> => {
      if (selectedPlanId == null) return false
      setMaterialSaving(true)
      setMaterialError(null)
      try {
        const res = await window.api.materialCreate({
          plan_id: selectedPlanId,
          type: data.type as 'requirements' | 'prototype' | 'api_spec' | 'note',
          source: 'manual',
          content: data.content
        })
        if (res.ok) {
          refetchMaterials()
          return true
        }
        setMaterialError(res.error.message)
        return false
      } catch (err) {
        setMaterialError(err instanceof Error ? err.message : 'Failed to add material')
        return false
      } finally {
        setMaterialSaving(false)
      }
    },
    [selectedPlanId, refetchMaterials]
  )

  const handleDeleteMaterial = useCallback(
    async (id: number) => {
      try {
        const res = await window.api.materialDelete({ id })
        if (res.ok) refetchMaterials()
      } catch (err) {
        console.error('Failed to delete material:', err)
      }
    },
    [refetchMaterials]
  )

  const handleAddTask = useCallback(
    async (data: { name: string; description: string; orderIndex: number }): Promise<boolean> => {
      if (selectedPlanId == null) return false
      setTaskSaving(true)
      setTaskError(null)
      try {
        const res = await window.api.taskCreate({
          plan_id: selectedPlanId,
          tasks: [
            {
              name: data.name,
              description: data.description,
              order_index: data.orderIndex
            }
          ]
        })
        if (res.ok) {
          refetchTasks()
          return true
        }
        setTaskError(res.error.message)
        return false
      } catch (err) {
        setTaskError(err instanceof Error ? err.message : 'Failed to add task')
        return false
      } finally {
        setTaskSaving(false)
      }
    },
    [selectedPlanId, refetchTasks]
  )

  const handleGenerateFromMaterials = useCallback(async (): Promise<boolean> => {
    if (selectedPlanId == null || !materials || materials.length === 0) return false
    setTaskSaving(true)
    setTaskError(null)
    try {
      // V1 placeholder: create one task per material
      const taskItems = materials.map((m, i) => ({
        name: `${materialTypeLabel(m.type)} task`,
        description: m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content,
        order_index: i
      }))
      const res = await window.api.taskCreate({
        plan_id: selectedPlanId,
        tasks: taskItems
      })
      if (res.ok) {
        refetchTasks()
        return true
      }
      setTaskError(res.error.message)
      return false
    } catch (err) {
      setTaskError(err instanceof Error ? err.message : 'Failed to generate tasks')
      return false
    } finally {
      setTaskSaving(false)
    }
  }, [selectedPlanId, materials, refetchTasks])

  const handleSelectProject = useCallback((value: string) => {
    const id = value === '__new__' ? null : Number(value)
    if (id !== null) {
      setSelectedProjectId(id)
      setSelectedPlanId(null) // Reset plan selection when project changes
    } else {
      setShowNewProject(true)
    }
  }, [])

  const handleSelectPlan = useCallback((value: string) => {
    const id = value === '__new__' ? null : Number(value)
    if (id !== null) {
      setSelectedPlanId(id)
    } else {
      setSelectedPlanId(null) // null = create new plan mode
    }
  }, [])

  // ── Render ──

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Planning</h1>
        <p className="text-muted-foreground text-xs/relaxed">
          Create plans, gather materials, and draft tasks before execution
        </p>
      </header>

      {/* ── Project Selector ── */}
      <Card size="sm">
        <CardContent className="space-y-3">
          <Label>Project</Label>
          {projectsLoading ? (
            <p className="text-muted-foreground text-xs/relaxed">Loading projects...</p>
          ) : projects.length === 0 && !showNewProject ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs/relaxed">
                No projects yet. Create one to get started.
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowNewProject(true)}>
                + New Project
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Select
                value={selectedProjectId?.toString() ?? ''}
                onValueChange={handleSelectProject}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ Create New Project</SelectItem>
                </SelectContent>
              </Select>

              {showNewProject && (
                <div className="flex gap-2">
                  <Input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="Project name"
                    disabled={newProjectSaving}
                    maxLength={10000}
                  />
                  <Button
                    size="default"
                    disabled={!newProjectName.trim() || newProjectSaving}
                    onClick={handleCreateProject}
                  >
                    {newProjectSaving ? 'Creating...' : 'Create'}
                  </Button>
                  <Button variant="ghost" size="default" onClick={() => setShowNewProject(false)}>
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Plan Selector (shown when project is selected) ── */}
      {selectedProjectId != null && (
        <Card size="sm">
          <CardContent className="space-y-3">
            <Label>Plan</Label>
            {plansLoading ? (
              <p className="text-muted-foreground text-xs/relaxed">Loading plans...</p>
            ) : (
              <Select
                value={selectedPlanId?.toString() ?? '__new__'}
                onValueChange={handleSelectPlan}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Create a new plan or select existing" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                      <span className="ml-1 text-muted-foreground">({p.status})</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">+ New Plan</SelectItem>
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Plan Form ── */}
      {selectedProjectId != null && (
        <PlanDraftForm
          key={currentPlan?.id ?? '__new__'}
          plan={currentPlan}
          loading={plansLoading}
          saving={planSaving}
          error={planError}
          onSave={handleSavePlan}
          onSetReady={handleSetReady}
        />
      )}

      {/* ── Materials (only when plan exists) ── */}
      {selectedPlanId != null && currentPlan && (
        <MaterialsInput
          materials={materials ?? []}
          locked={locked}
          saving={materialSaving}
          error={materialError}
          onAdd={handleAddMaterial}
          onDelete={handleDeleteMaterial}
        />
      )}

      {/* ── Task Drafts (only when plan exists) ── */}
      {selectedPlanId != null && currentPlan && (
        <TaskDraftList
          tasks={tasks ?? []}
          locked={locked}
          saving={taskSaving}
          error={taskError}
          onAddTask={handleAddTask}
          onGenerateFromMaterials={handleGenerateFromMaterials}
          materialCount={materials?.length ?? 0}
        />
      )}
    </div>
  )
}
