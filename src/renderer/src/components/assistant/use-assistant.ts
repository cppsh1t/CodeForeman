import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  PlanOutput,
  TaskOutput,
  TaskRunOutput,
  PaginatedMessages,
  ExecutionStats
} from './types'
import { computeExecutionStats } from './utils'

// ── Types ──

interface UseAssistantReturn {
  // Plan state
  planId: number | null
  changePlan: (planId: number | null) => void
  plan: PlanOutput | null
  planLoading: boolean
  planError: string | null

  // Task state
  tasks: TaskOutput[]
  taskRuns: TaskRunOutput[]
  stats: ExecutionStats
  tasksLoading: boolean
  tasksError: string | null
  refetchAll: () => void

  // Execution control
  controlLoading: boolean
  controlError: string | null
  executionStart: () => Promise<boolean>
  executionPause: () => Promise<boolean>
  executionResume: () => Promise<boolean>
  executionStop: () => Promise<boolean>

  // Timeline
  timelineMessages: PaginatedMessages | null
  timelineLoading: boolean
  timelineError: string | null

  // Force-think
  thinkSubmitting: boolean
  thinkError: string | null
  thinkSuccess: boolean
  submitThink: (input: {
    task_run_id: number
    trigger_type: string
    decision: string
    reason: string
  }) => Promise<boolean>
  clearThinkStatus: () => void
}

// ── Auto-refresh interval for active execution ──
const POLL_INTERVAL_MS = 3000

/**
 * Core hook for the assistant page.
 * Manages plan/task/run state, execution controls, timeline, and force-think.
 * All data is read from persisted state via IPC — no in-memory-only truth.
 */
export function useAssistant(initialPlanId?: number | undefined): UseAssistantReturn {
  const [planId, setPlanId] = useState<number | null>(initialPlanId ?? null)
  const [plan, setPlan] = useState<PlanOutput | null>(null)
  const [planLoading, setPlanLoading] = useState(initialPlanId != null)
  const [planError, setPlanError] = useState<string | null>(null)

  const [tasks, setTasks] = useState<TaskOutput[]>([])
  const [taskRuns, setTaskRuns] = useState<TaskRunOutput[]>([])
  const [tasksLoading, setTasksLoading] = useState(initialPlanId != null)
  const [tasksError, setTasksError] = useState<string | null>(null)

  const [controlLoading, setControlLoading] = useState(false)
  const [controlError, setControlError] = useState<string | null>(null)

  const [timelineMessages, setTimelineMessages] = useState<PaginatedMessages | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)

  const [thinkSubmitting, setThinkSubmitting] = useState(false)
  const [thinkError, setThinkError] = useState<string | null>(null)
  const [thinkSuccess, setThinkSuccess] = useState(false)

  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // ── Derived ──
  const stats = computeExecutionStats(tasks, taskRuns)

  // ── Fetch all data for a given plan ──
  const fetchAll = useCallback(async (pid: number) => {
    setPlanLoading(true)
    setTasksLoading(true)
    setPlanError(null)
    setTasksError(null)

    try {
      const [planRes, tasksRes, runsRes] = await Promise.all([
        window.api.planGet({ id: pid }),
        window.api.taskList({ plan_id: pid }),
        window.api.taskRunList({ plan_id: pid })
      ])

      if (!mountedRef.current) return

      if (planRes.ok) setPlan(planRes.data)
      else setPlanError(planRes.error.message)

      if (tasksRes.ok) setTasks(tasksRes.data)
      else setTasksError(tasksRes.error.message)

      if (runsRes.ok) setTaskRuns(runsRes.data)
      else setTasksError((prev) => prev ?? runsRes.error.message)
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : 'Failed to load plan data'
      setPlanError(msg)
      setTasksError(msg)
    } finally {
      if (mountedRef.current) {
        setPlanLoading(false)
        setTasksLoading(false)
      }
    }
  }, [])

  // ── Fetch timeline messages for the latest/running task run ──
  const fetchTimeline = useCallback(async (pid: number) => {
    setTimelineLoading(true)
    setTimelineError(null)

    try {
      const runsRes = await window.api.taskRunList({ plan_id: pid })
      if (!mountedRef.current) return

      if (runsRes.ok && runsRes.data.length > 0) {
        // Use the latest run for timeline
        const latestRun = runsRes.data[runsRes.data.length - 1]
        const msgRes = await window.api.messageList({
          task_run_id: latestRun.id,
          page: 1,
          page_size: 50
        })
        if (!mountedRef.current) return

        if (msgRes.ok) setTimelineMessages(msgRes.data)
        else setTimelineError(msgRes.error.message)
      } else {
        setTimelineMessages(null)
      }
    } catch (err) {
      if (!mountedRef.current) return
      setTimelineError(err instanceof Error ? err.message : 'Failed to load timeline')
    } finally {
      if (mountedRef.current) setTimelineLoading(false)
    }
  }, [])

  // ── Load when planId changes ──
  useEffect(() => {
    if (planId == null) {
      setPlan(null)
      setTasks([])
      setTaskRuns([])
      setTimelineMessages(null)
      setPlanError(null)
      setTasksError(null)
      return
    }

    fetchAll(planId)
    fetchTimeline(planId)
  }, [planId, fetchAll, fetchTimeline])

  // ── Auto-refresh when plan is running/paused/blocked ──
  useEffect(() => {
    if (!plan) return
    const isActive =
      plan.status === 'running' || plan.status === 'paused' || plan.status === 'blocked'
    if (!isActive || planId == null) return

    const interval = setInterval(() => {
      fetchAll(planId)
      fetchTimeline(planId)
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [plan, planId, fetchAll, fetchTimeline])

  // ── Public: change plan ──
  const changePlan = useCallback((pid: number | null) => {
    setPlanId(pid)
    setControlError(null)
    setThinkError(null)
    setThinkSuccess(false)
  }, [])

  // ── Execution controls ──

  const callExecution = useCallback(
    async (fn: (pid: number) => Promise<{ ok: boolean; error?: { message: string } }>) => {
      if (planId == null) return false
      setControlLoading(true)
      setControlError(null)
      try {
        const res = await fn(planId)
        if (!mountedRef.current) return false
        if (res.ok) {
          // Refetch after status change
          fetchAll(planId)
          fetchTimeline(planId)
          return true
        }
        setControlError(res.error?.message ?? 'Operation failed')
        return false
      } catch (err) {
        if (!mountedRef.current) return false
        setControlError(err instanceof Error ? err.message : 'Execution control failed')
        return false
      } finally {
        if (mountedRef.current) setControlLoading(false)
      }
    },
    [planId, fetchAll, fetchTimeline]
  )

  const executionStart = useCallback(
    () => callExecution((pid) => window.api.executionStart({ plan_id: pid })),
    [callExecution]
  )

  const executionPause = useCallback(
    () => callExecution((pid) => window.api.executionPause({ plan_id: pid })),
    [callExecution]
  )

  const executionResume = useCallback(
    () => callExecution((pid) => window.api.executionResume({ plan_id: pid })),
    [callExecution]
  )

  const executionStop = useCallback(
    () => callExecution((pid) => window.api.executionStop({ plan_id: pid })),
    [callExecution]
  )

  // ── Force-think submission ──

  const submitThink = useCallback(
    async (input: {
      task_run_id: number
      trigger_type: string
      decision: string
      reason: string
    }): Promise<boolean> => {
      setThinkSubmitting(true)
      setThinkError(null)
      setThinkSuccess(false)
      try {
        const res = await window.api.thinkSubmit({
          task_run_id: input.task_run_id,
          trigger_type: input.trigger_type as 'failure' | 'user_force' | 'interval',
          decision: input.decision as 'continue_next' | 'retry_current' | 'reorder' | 'stop_plan',
          reason: input.reason
        })
        if (!mountedRef.current) return false
        if (res.ok) {
          setThinkSuccess(true)
          // Refetch to reflect changes
          if (planId != null) {
            fetchAll(planId)
            fetchTimeline(planId)
          }
          return true
        }
        setThinkError(res.error.message)
        return false
      } catch (err) {
        if (!mountedRef.current) return false
        setThinkError(err instanceof Error ? err.message : 'Think submission failed')
        return false
      } finally {
        if (mountedRef.current) setThinkSubmitting(false)
      }
    },
    [planId, fetchAll, fetchTimeline]
  )

  const clearThinkStatus = useCallback(() => {
    setThinkError(null)
    setThinkSuccess(false)
  }, [])

  const refetchAll = useCallback(() => {
    if (planId != null) {
      fetchAll(planId)
      fetchTimeline(planId)
    }
  }, [planId, fetchAll, fetchTimeline])

  return {
    planId,
    plan,
    planLoading,
    planError,
    tasks,
    taskRuns,
    stats,
    tasksLoading,
    tasksError,
    refetchAll,
    controlLoading,
    controlError,
    executionStart,
    executionPause,
    executionResume,
    executionStop,
    timelineMessages,
    timelineLoading,
    timelineError,
    thinkSubmitting,
    thinkError,
    thinkSuccess,
    submitThink,
    clearThinkStatus,
    // Expose changePlan for page-level plan selection
    changePlan
  }
}
