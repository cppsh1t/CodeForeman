import { useState } from 'react'
import type { TaskDraftItem } from '@/hooks/use-planning'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface TaskDraftListProps {
  tasks: TaskDraftItem[]
  locked: boolean
  saving: boolean
  error: string | null
  onAddTask: (data: { name: string; description: string; orderIndex: number }) => Promise<boolean>
  onGenerateFromMaterials: () => Promise<boolean>
  materialCount: number
}

export function TaskDraftList({
  tasks,
  locked,
  saving,
  error,
  onAddTask,
  onGenerateFromMaterials,
  materialCount
}: TaskDraftListProps): React.JSX.Element {
  const [showAddForm, setShowAddForm] = useState(false)
  const [taskName, setTaskName] = useState('')
  const [taskDescription, setTaskDescription] = useState('')

  const canAddTask = taskName.trim().length > 0 && !locked && !saving
  const canGenerate = materialCount > 0 && !locked && !saving && tasks.length === 0

  const handleAddTask = async (): Promise<void> => {
    if (!canAddTask) return
    const ok = await onAddTask({
      name: taskName.trim(),
      description: taskDescription.trim(),
      orderIndex: tasks.length
    })
    if (ok) {
      setTaskName('')
      setTaskDescription('')
      setShowAddForm(false)
    }
  }

  const sortedTasks = [...tasks].sort((a, b) => a.order_index - b.order_index)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Task Drafts</CardTitle>
            {tasks.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {tasks.length}
              </Badge>
            )}
          </div>
          {!locked && (
            <div className="flex gap-1.5">
              {canGenerate && (
                <Button variant="outline" size="sm" onClick={onGenerateFromMaterials}>
                  Generate from Materials
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? 'Cancel' : '+ Add Task'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAddForm && (
          <div className="space-y-2 rounded-md border border-border p-3">
            <div className="space-y-1.5">
              <label htmlFor="task-name" className="text-xs/relaxed font-medium">
                Task Name
              </label>
              <Input
                id="task-name"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                disabled={locked}
                placeholder="Task name"
                maxLength={10000}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="task-description" className="text-xs/relaxed font-medium">
                Description
              </label>
              <Textarea
                id="task-description"
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                disabled={locked}
                placeholder="Describe what this task should accomplish"
                rows={2}
                maxLength={10000}
              />
            </div>
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={!canAddTask} onClick={handleAddTask}>
                {saving ? 'Adding...' : 'Add Task'}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-destructive text-xs/relaxed" role="alert">
            {error}
          </p>
        )}

        {sortedTasks.length === 0 && !showAddForm ? (
          <div className="rounded-md border border-dashed border-border py-8 text-center">
            <p className="text-muted-foreground text-xs/relaxed">No tasks yet</p>
            <p className="text-muted-foreground text-xs/relaxed mt-1">
              {locked
                ? 'Tasks cannot be modified at this stage'
                : materialCount > 0
                  ? 'Generate tasks from materials or add them manually'
                  : 'Add materials first, then generate tasks'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedTasks.map((task) => (
              <div key={task.id} className="flex gap-3 rounded-md border border-border p-3">
                <span className="shrink-0 w-6 text-center font-mono text-xs/relaxed text-muted-foreground">
                  #{task.order_index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{task.name}</p>
                  {task.description && (
                    <p className="mt-1 text-xs/relaxed text-muted-foreground line-clamp-2">
                      {task.description}
                    </p>
                  )}
                </div>
                <Badge variant="outline" className="shrink-0 mt-0.5">
                  {task.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
