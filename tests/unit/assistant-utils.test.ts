import { describe, it, expect } from 'vitest'
import {
  computeExecutionStats,
  taskStatusLabel,
  taskStatusBadgeVariant,
  planStatusLabel,
  validateThinkInput,
  buildTimelineFromMessages,
  formatTimelineTimestamp,
  formatDuration,
  thinkDecisionLabel,
  triggerTypeLabel
} from '@/components/assistant/utils'
import type { TaskOutput, TaskRunOutput, MessageOutput } from '@/components/assistant/types'

// ── computeExecutionStats ──

describe('computeExecutionStats', () => {
  const makeTask = (overrides: Partial<TaskOutput> = {}): TaskOutput => ({
    id: 1,
    plan_id: 1,
    name: 'Task 1',
    description: '',
    status: 'pending',
    order_index: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  })

  const makeRun = (overrides: Partial<TaskRunOutput> = {}): TaskRunOutput => ({
    id: 1,
    task_id: 1,
    status: 'success',
    error_code: null,
    started_at: '2026-01-01T00:00:00Z',
    finished_at: '2026-01-01T00:01:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:01:00Z',
    ...overrides
  })

  it('returns zeros for empty task list', () => {
    const stats = computeExecutionStats([], [])
    expect(stats).toEqual({
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      runningTask: null,
      pendingTasks: 0,
      blockedTasks: 0,
      skippedTasks: 0,
      progressPercent: 0
    })
  })

  it('counts tasks by task status when no runs exist', () => {
    const tasks = [
      makeTask({ id: 1, status: 'success', order_index: 0 }),
      makeTask({ id: 2, status: 'pending', order_index: 1 }),
      makeTask({ id: 3, status: 'failed', order_index: 2 }),
      makeTask({ id: 4, status: 'blocked', order_index: 3 }),
      makeTask({ id: 5, status: 'skipped', order_index: 4 })
    ]
    const stats = computeExecutionStats(tasks, [])
    expect(stats.totalTasks).toBe(5)
    expect(stats.completedTasks).toBe(1)
    expect(stats.failedTasks).toBe(1)
    expect(stats.pendingTasks).toBe(1)
    expect(stats.blockedTasks).toBe(1)
    expect(stats.skippedTasks).toBe(1)
    expect(stats.runningTask).toBeNull()
  })

  it('uses latest run status over task status', () => {
    const tasks = [
      makeTask({ id: 1, status: 'pending', order_index: 0 }),
      makeTask({ id: 2, status: 'pending', order_index: 1 })
    ]
    const runs = [makeRun({ id: 1, task_id: 1, status: 'success' })]
    const stats = computeExecutionStats(tasks, runs)
    expect(stats.completedTasks).toBe(1)
    expect(stats.pendingTasks).toBe(1)
  })

  it('identifies running task from runs', () => {
    const tasks = [
      makeTask({ id: 1, status: 'pending', order_index: 0 }),
      makeTask({ id: 2, status: 'pending', order_index: 1 })
    ]
    const runs = [makeRun({ id: 1, task_id: 2, status: 'running' })]
    const stats = computeExecutionStats(tasks, runs)
    expect(stats.runningTask).not.toBeNull()
    expect(stats.runningTask!.id).toBe(2)
  })

  it('calculates progress percent correctly', () => {
    const tasks = [
      makeTask({ id: 1, status: 'success', order_index: 0 }),
      makeTask({ id: 2, status: 'skipped', order_index: 1 }),
      makeTask({ id: 3, status: 'pending', order_index: 2 }),
      makeTask({ id: 4, status: 'pending', order_index: 3 })
    ]
    const stats = computeExecutionStats(tasks, [])
    // 2 out of 4 = 50%
    expect(stats.progressPercent).toBe(50)
  })

  it('uses newer run when multiple runs exist for same task', () => {
    const tasks = [makeTask({ id: 1, status: 'pending', order_index: 0 })]
    const runs = [
      makeRun({ id: 1, task_id: 1, status: 'failed', created_at: '2026-01-01T00:00:00Z' }),
      makeRun({ id: 2, task_id: 1, status: 'success', created_at: '2026-01-01T00:01:00Z' })
    ]
    const stats = computeExecutionStats(tasks, runs)
    expect(stats.completedTasks).toBe(1)
    expect(stats.failedTasks).toBe(0)
  })
})

// ── taskStatusLabel / taskStatusBadgeVariant ──

describe('taskStatusLabel', () => {
  it('maps all task statuses to labels', () => {
    expect(taskStatusLabel('pending')).toBe('Pending')
    expect(taskStatusLabel('running')).toBe('Running')
    expect(taskStatusLabel('success')).toBe('Completed')
    expect(taskStatusLabel('failed')).toBe('Failed')
    expect(taskStatusLabel('blocked')).toBe('Blocked')
    expect(taskStatusLabel('skipped')).toBe('Skipped')
    expect(taskStatusLabel('unknown')).toBe('unknown')
  })
})

describe('taskStatusBadgeVariant', () => {
  it('maps statuses to badge variants', () => {
    expect(taskStatusBadgeVariant('pending')).toBe('outline')
    expect(taskStatusBadgeVariant('running')).toBe('default')
    expect(taskStatusBadgeVariant('success')).toBe('secondary')
    expect(taskStatusBadgeVariant('failed')).toBe('destructive')
    expect(taskStatusBadgeVariant('blocked')).toBe('destructive')
    expect(taskStatusBadgeVariant('skipped')).toBe('outline')
  })
})

// ── planStatusLabel ──

describe('planStatusLabel', () => {
  it('maps all plan statuses to labels', () => {
    expect(planStatusLabel('draft')).toBe('Draft')
    expect(planStatusLabel('ready')).toBe('Ready')
    expect(planStatusLabel('running')).toBe('Running')
    expect(planStatusLabel('paused')).toBe('Paused')
    expect(planStatusLabel('completed')).toBe('Completed')
    expect(planStatusLabel('blocked')).toBe('Blocked')
    expect(planStatusLabel('stopped')).toBe('Stopped')
    expect(planStatusLabel('unknown')).toBe('unknown')
  })
})

// ── validateThinkInput ──

describe('validateThinkInput', () => {
  it('returns no errors for valid input', () => {
    const errors = validateThinkInput({
      task_run_id: 1,
      decision: 'continue_next',
      reason: 'All good'
    })
    expect(errors).toHaveLength(0)
  })

  it('errors on null task_run_id', () => {
    const errors = validateThinkInput({
      task_run_id: null,
      decision: 'continue_next',
      reason: 'ok'
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('task_run_id')
  })

  it('errors on zero task_run_id', () => {
    const errors = validateThinkInput({ task_run_id: 0, decision: 'continue_next', reason: 'ok' })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('task_run_id')
  })

  it('errors on null decision', () => {
    const errors = validateThinkInput({ task_run_id: 1, decision: null, reason: 'ok' })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('decision')
  })

  it('errors on empty reason', () => {
    const errors = validateThinkInput({ task_run_id: 1, decision: 'continue_next', reason: '' })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('reason')
  })

  it('errors on whitespace-only reason', () => {
    const errors = validateThinkInput({ task_run_id: 1, decision: 'continue_next', reason: '   ' })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('reason')
  })

  it('errors on oversized reason', () => {
    const longReason = 'x'.repeat(10_001)
    const errors = validateThinkInput({
      task_run_id: 1,
      decision: 'continue_next',
      reason: longReason
    })
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('reason')
    expect(errors[0].message).toContain('10,000')
  })

  it('allows reason at exactly max length', () => {
    const maxReason = 'x'.repeat(10_000)
    const errors = validateThinkInput({
      task_run_id: 1,
      decision: 'continue_next',
      reason: maxReason
    })
    expect(errors).toHaveLength(0)
  })

  it('returns multiple errors at once', () => {
    const errors = validateThinkInput({ task_run_id: null, decision: null, reason: '' })
    expect(errors).toHaveLength(3)
  })
})

// ── buildTimelineFromMessages ──

describe('buildTimelineFromMessages', () => {
  const makeMessage = (overrides: Partial<MessageOutput> = {}): MessageOutput => ({
    id: 1,
    task_run_id: 1,
    correlation_id: 'corr-1',
    role: 'system',
    content: 'test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides
  })

  it('returns empty for no messages', () => {
    const events = buildTimelineFromMessages([])
    expect(events).toHaveLength(0)
  })

  it('sorts newest first', () => {
    const messages = [
      makeMessage({ id: 1, created_at: '2026-01-01T00:00:00Z' }),
      makeMessage({ id: 2, created_at: '2026-01-01T00:00:01Z' }),
      makeMessage({ id: 3, created_at: '2026-01-01T00:00:02Z' })
    ]
    const events = buildTimelineFromMessages(messages)
    expect(events[0].id).toBe('msg-3')
    expect(events[1].id).toBe('msg-2')
    expect(events[2].id).toBe('msg-1')
  })

  it('respects limit parameter', () => {
    const messages = Array.from({ length: 100 }, (_, i) =>
      makeMessage({ id: i + 1, created_at: `2026-01-01T00:${String(i).padStart(2, '0')}:00Z` })
    )
    const events = buildTimelineFromMessages(messages, 10)
    expect(events).toHaveLength(10)
    // Should be the last 10, sorted newest first
    expect(events[0].id).toBe('msg-100')
  })

  it('prefixes event ids with msg-', () => {
    const messages = [makeMessage({ id: 42 })]
    const events = buildTimelineFromMessages(messages)
    expect(events[0].id).toBe('msg-42')
  })
})

// ── formatTimelineTimestamp ──

describe('formatTimelineTimestamp', () => {
  it('formats valid ISO string', () => {
    const result = formatTimelineTimestamp('2026-01-01T14:32:05Z')
    // Format depends on locale, but should not be empty
    expect(result).toBeTruthy()
    expect(result).toContain(':')
  })

  it('returns fallback for invalid input', () => {
    // new Date('not-a-date') produces Invalid Date; toLocaleTimeString returns 'Invalid Date'
    const result = formatTimelineTimestamp('not-a-date')
    expect(result).toBe('Invalid Date')
  })
})

// ── formatDuration ──

describe('formatDuration', () => {
  it('returns dash for null start', () => {
    expect(formatDuration(null, null)).toBe('—')
  })

  it('formats sub-second duration', () => {
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:00:00.500Z')).toBe('<1s')
  })

  it('formats seconds', () => {
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:00:15Z')).toBe('15s')
  })

  it('formats minutes and seconds', () => {
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:02:30Z')).toBe('2m 30s')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T02:15:00Z')).toBe('2h 15m')
  })

  it('computes elapsed time when finishedAt is null', () => {
    // This will compute from startedAt to now, which should be at least 0
    const result = formatDuration('2026-01-01T00:00:00Z', null)
    expect(result).toBeTruthy()
    expect(result).not.toBe('—')
  })
})

// ── thinkDecisionLabel / triggerTypeLabel ──

describe('thinkDecisionLabel', () => {
  it('maps all decisions to labels', () => {
    expect(thinkDecisionLabel('continue_next')).toBe('Continue Next')
    expect(thinkDecisionLabel('retry_current')).toBe('Retry Current')
    expect(thinkDecisionLabel('reorder')).toBe('Reorder Tasks')
    expect(thinkDecisionLabel('stop_plan')).toBe('Stop Plan')
  })
})

describe('triggerTypeLabel', () => {
  it('maps all triggers to labels', () => {
    expect(triggerTypeLabel('failure')).toBe('Failure')
    expect(triggerTypeLabel('user_force')).toBe('User Forced')
    expect(triggerTypeLabel('interval')).toBe('Interval')
  })
})
