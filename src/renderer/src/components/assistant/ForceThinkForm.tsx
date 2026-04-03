import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { TaskRunOutput, ThinkValidationError } from './types'
import { validateThinkInput, thinkDecisionLabel } from './utils'

interface ForceThinkFormProps {
  taskRuns: TaskRunOutput[]
  submitting: boolean
  error: string | null
  success: boolean
  onSubmit: (input: {
    task_run_id: number
    trigger_type: string
    decision: string
    reason: string
  }) => Promise<boolean>
}

export function ForceThinkForm({
  taskRuns,
  submitting,
  error,
  success,
  onSubmit
}: ForceThinkFormProps): React.JSX.Element {
  const [selectedRunId, setSelectedRunId] = useState<string>('')
  const [decision, setDecision] = useState<string>('')
  const [reason, setReason] = useState('')
  const [validationErrors, setValidationErrors] = useState<ThinkValidationError[]>([])

  const validationErrorMap = new Map(validationErrors.map((e) => [e.field, e.message]))

  const handleSubmit = useCallback(async () => {
    const errors = validateThinkInput({
      task_run_id: selectedRunId ? Number(selectedRunId) : null,
      decision: decision || null,
      reason
    })

    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }

    setValidationErrors([])
    const ok = await onSubmit({
      task_run_id: Number(selectedRunId),
      trigger_type: 'user_force',
      decision,
      reason: reason.trim()
    })

    // Clear reason field on success, but keep success/error feedback visible
    if (ok) {
      setReason('')
    }
  }, [selectedRunId, decision, reason, onSubmit])

  // Only show runs that have completed (success/failed/cancelled) or are still running
  const actionableRuns = taskRuns.filter(
    (r) => r.status === 'running' || r.status === 'failed' || r.status === 'success'
  )

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Force Think</CardTitle>
        <CardDescription>
          Submit a think decision to influence execution. Trigger type: user_force.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Task Run Selector */}
        <div className="space-y-1.5">
          <Label>Task Run</Label>
          <Select value={selectedRunId} onValueChange={setSelectedRunId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a task run" />
            </SelectTrigger>
            <SelectContent>
              {actionableRuns.length === 0 ? (
                <SelectItem value="__none__" disabled>
                  No actionable runs
                </SelectItem>
              ) : (
                actionableRuns.map((run) => (
                  <SelectItem key={run.id} value={run.id.toString()}>
                    Run #{run.id} <span className="text-muted-foreground">({run.status})</span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {validationErrorMap.get('task_run_id') && (
            <p className="text-[0.625rem] text-destructive">
              {validationErrorMap.get('task_run_id')}
            </p>
          )}
        </div>

        {/* Decision Type */}
        <div className="space-y-1.5">
          <Label>Decision</Label>
          <Select value={decision} onValueChange={setDecision}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select decision type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="continue_next">{thinkDecisionLabel('continue_next')}</SelectItem>
              <SelectItem value="retry_current">{thinkDecisionLabel('retry_current')}</SelectItem>
              <SelectItem value="reorder">{thinkDecisionLabel('reorder')}</SelectItem>
              <SelectItem value="stop_plan">{thinkDecisionLabel('stop_plan')}</SelectItem>
            </SelectContent>
          </Select>
          {validationErrorMap.get('decision') && (
            <p className="text-[0.625rem] text-destructive">{validationErrorMap.get('decision')}</p>
          )}
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <Label>Reason</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain your decision..."
            rows={3}
            className="text-xs"
            maxLength={10000}
          />
          <div className="flex items-center justify-between">
            {validationErrorMap.get('reason') ? (
              <p className="text-[0.625rem] text-destructive">{validationErrorMap.get('reason')}</p>
            ) : (
              <span />
            )}
            <span className="text-[0.625rem] text-muted-foreground tabular-nums">
              {reason.length.toLocaleString()} / 10,000
            </span>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedRunId || !decision}
            size="sm"
          >
            {submitting ? 'Submitting...' : 'Submit Think Decision'}
          </Button>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-emerald-500">Decision recorded successfully.</p>}
        </div>
      </CardContent>
    </Card>
  )
}
