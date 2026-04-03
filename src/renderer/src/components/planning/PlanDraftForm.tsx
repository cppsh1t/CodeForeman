import { useState } from 'react'
import type { PlanItem } from '@/hooks/use-planning'
import { isPlanEditable, planStatusVariant } from '@/hooks/use-planning'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PlanDraftFormProps {
  plan: PlanItem | null
  loading: boolean
  saving: boolean
  error: string | null
  onSave: (data: { name: string; description: string }) => Promise<boolean>
  onSetReady: () => Promise<boolean>
}

export function PlanDraftForm({
  plan,
  loading,
  saving,
  error,
  onSave,
  onSetReady
}: PlanDraftFormProps): React.JSX.Element {
  const [name, setName] = useState(plan?.name ?? '')
  const [description, setDescription] = useState(plan?.description ?? '')

  const locked = !loading && plan ? !isPlanEditable(plan.status) : false
  const isNew = plan === null
  const canSave = name.trim().length > 0 && !locked && !saving
  // Mark Ready only available in draft (the transition is draft→ready)
  const canSetReady = !isNew && plan.status === 'draft' && name.trim().length > 0

  const handleSave = async (): Promise<void> => {
    const ok = await onSave({ name: name.trim(), description: description.trim() })
    if (ok && isNew) {
      // Plan was created — parent will update plan ref
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{isNew ? 'New Plan' : 'Plan'}</CardTitle>
          {plan && <Badge variant={planStatusVariant(plan.status)}>{plan.status}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="plan-name">Name</Label>
          <Input
            id="plan-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={locked}
            placeholder="Plan name"
            maxLength={10000}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-description">Description</Label>
          <Textarea
            id="plan-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={locked}
            placeholder="Describe the plan objectives and scope"
            rows={4}
            maxLength={10000}
          />
        </div>
        {error && (
          <p className="text-destructive text-xs/relaxed" role="alert">
            {error}
          </p>
        )}
        {locked && (
          <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-muted-foreground text-xs/relaxed">
              This plan is locked because it has entered running status.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="gap-2">
        <Button disabled={!canSave} onClick={handleSave}>
          {saving ? 'Saving...' : isNew ? 'Create Draft' : 'Save'}
        </Button>
        {!isNew && (
          <Button variant="outline" disabled={!canSetReady || saving} onClick={onSetReady}>
            Mark Ready
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
