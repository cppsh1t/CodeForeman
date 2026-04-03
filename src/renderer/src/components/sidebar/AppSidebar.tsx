// ── App Sidebar ──
//
// Left sidebar showing projects → plans hierarchy.
// Clicking a plan selects it and triggers the main area to show the 3-page tab view.

import { useState, useEffect, useCallback } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ── Domain Types ──

interface Project {
  id: number
  name: string
  status: 'active' | 'archived'
}

interface Plan {
  id: number
  project_id: number
  name: string
  status: 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'blocked' | 'stopped'
}

// ── Status Badge Helpers ──

const planStatusColors: Record<Plan['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  ready: 'bg-blue-500/10 text-blue-500',
  running: 'bg-green-500/10 text-green-500',
  paused: 'bg-yellow-500/10 text-yellow-500',
  completed: 'bg-emerald-500/10 text-emerald-500',
  blocked: 'bg-red-500/10 text-red-500',
  stopped: 'bg-gray-500/10 text-gray-500'
}

// ── Sidebar Component ──

export interface SidebarSelection {
  projectId: number
  planId: number
  planName: string
}

interface AppSidebarProps {
  selectedPlan: SidebarSelection | null
  onSelectPlan: (selection: SidebarSelection) => void
}

export function AppSidebar({ selectedPlan, onSelectPlan }: AppSidebarProps): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [plansByProject, setPlansByProject] = useState<Map<number, Plan[]>>(new Map())
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)

  // Fetch projects on mount
  useEffect(() => {
    window.api
      .projectList({ page: 1, page_size: 50 })
      .then((res) => {
        if (res.ok) {
          setProjects(res.data.items)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Fetch plans when a project is expanded
  const loadPlans = useCallback(
    async (projectId: number) => {
      if (plansByProject.has(projectId)) return
      try {
        const res = await window.api.planList({ project_id: projectId, page: 1, page_size: 50 })
        if (res.ok) {
          setPlansByProject((prev) => new Map(prev).set(projectId, res.data.items))
        }
      } catch (err) {
        console.error(`Failed to load plans for project ${projectId}:`, err)
      }
    },
    [plansByProject]
  )

  const toggleProject = useCallback(
    (projectId: number) => {
      setExpandedProjects((prev) => {
        const next = new Set(prev)
        if (next.has(projectId)) {
          next.delete(projectId)
        } else {
          next.add(projectId)
          loadPlans(projectId)
        }
        return next
      })
    },
    [loadPlans]
  )

  const handleSelectPlan = useCallback(
    (project: Project, plan: Plan) => {
      onSelectPlan({
        projectId: project.id,
        planId: plan.id,
        planName: plan.name
      })
    },
    [onSelectPlan]
  )

  if (loading) {
    return (
      <div className="flex h-full w-[220px] flex-col border-r border-border bg-sidebar p-3">
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-[220px] flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center px-3">
        <h2 className="text-sm font-semibold text-foreground">CodeForeman</h2>
      </div>
      <Separator />

      {/* Project/Plan Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {projects.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">No projects yet</p>
          ) : (
            projects.map((project) => (
              <ProjectTreeItem
                key={project.id}
                project={project}
                plans={plansByProject.get(project.id) ?? []}
                isExpanded={expandedProjects.has(project.id)}
                isSelected={selectedPlan?.projectId === project.id}
                selectedPlanId={selectedPlan?.planId}
                onToggle={() => toggleProject(project.id)}
                onSelectPlan={(plan) => handleSelectPlan(project, plan)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

// ── Project Tree Item ──

interface ProjectTreeItemProps {
  project: Project
  plans: Plan[]
  isExpanded: boolean
  isSelected: boolean
  selectedPlanId?: number
  onToggle: () => void
  onSelectPlan: (plan: Plan) => void
}

function ProjectTreeItem({
  project,
  plans,
  isExpanded,
  isSelected,
  selectedPlanId,
  onToggle,
  onSelectPlan
}: ProjectTreeItemProps): React.JSX.Element {
  return (
    <div className="mb-0.5">
      <button
        type="button"
        className={cn(
          'flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
          isSelected && !isExpanded && 'bg-accent'
        )}
        onClick={onToggle}
      >
        <ChevronIcon expanded={isExpanded} />
        <span className="truncate font-medium text-foreground">{project.name}</span>
        {project.status === 'archived' && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            Archived
          </Badge>
        )}
      </button>

      {isExpanded && (
        <div className="ml-4 mt-0.5 border-l border-border pl-2">
          {plans.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">No plans</p>
          ) : (
            plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={cn(
                  'flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent',
                  selectedPlanId === plan.id && 'bg-accent text-accent-foreground'
                )}
                onClick={() => onSelectPlan(plan)}
              >
                <PlanIcon status={plan.status} />
                <span className="truncate">{plan.name}</span>
                <Badge
                  variant="ghost"
                  className={cn('ml-auto text-[10px]', planStatusColors[plan.status])}
                >
                  {plan.status}
                </Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Icons ──

function ChevronIcon({ expanded }: { expanded: boolean }): React.JSX.Element {
  return (
    <svg
      className={cn(
        'h-3 w-3 shrink-0 text-muted-foreground transition-transform',
        expanded && 'rotate-90'
      )}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function PlanIcon({ status }: { status: Plan['status'] }): React.JSX.Element {
  const color =
    status === 'running'
      ? 'text-green-500'
      : status === 'completed'
        ? 'text-emerald-500'
        : status === 'blocked'
          ? 'text-red-500'
          : 'text-muted-foreground'

  return (
    <svg
      className={cn('h-3 w-3 shrink-0', color)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}
