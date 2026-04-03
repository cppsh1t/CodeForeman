import { useState, useEffect, useCallback, useRef } from 'react'

// ── Shape types matching IPC output schemas ──

export interface ProjectItem {
  id: number
  name: string
  description: string
  status: string
  created_at: string
  updated_at: string
}

export interface PlanItem {
  id: number
  project_id: number
  name: string
  description: string
  status: string
  created_at: string
  updated_at: string
}

export interface MaterialItem {
  id: number
  plan_id: number
  type: string
  source: string
  content: string
  created_at: string
  updated_at: string
}

export interface TaskDraftItem {
  id: number
  plan_id: number
  name: string
  description: string
  status: string
  order_index: number
  created_at: string
  updated_at: string
}

export interface PaginatedList<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

// ── Generic fetch hook ──
// Uses a `key` parameter to trigger re-fetches when dependencies change.
// State is reset during render (React-recommended pattern for prop-driven resets).
// The fetchFn ref is updated via effect to keep the callback fresh.

export function useFetch<T>(
  key: string | number | null | undefined,
  fetchFn: () => Promise<{ ok: boolean; data?: T; error?: { message: string } }>
): FetchState<T> & { refetch: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(key != null)
  const [error, setError] = useState<string | null>(null)

  // Reset state when key changes (render-phase state reset, React docs pattern)
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    if (key == null) {
      setData(null)
      setLoading(false)
      setError(null)
    } else {
      setLoading(true)
      setError(null)
    }
  }

  // Keep ref in sync via effect (avoids setting ref during render)
  const fetchRef = useRef(fetchFn)
  useEffect(() => {
    fetchRef.current = fetchFn
  })

  useEffect(() => {
    if (key == null) return
    const cancelled = { value: false }
    fetchRef
      .current()
      .then((res) => {
        if (cancelled.value) return
        if (res.ok) setData(res.data ?? null)
        else setError(res.error?.message ?? 'Request failed')
      })
      .catch((err) => {
        if (cancelled.value) return
        setError(err instanceof Error ? err.message : 'Network error')
      })
      .finally(() => {
        if (!cancelled.value) setLoading(false)
      })
    return () => {
      cancelled.value = true
    }
  }, [key])

  const refetch = useCallback((): void => {
    if (key == null) return
    const cancelled = { value: false }
    setLoading(true)
    setError(null)
    fetchRef
      .current()
      .then((res) => {
        if (cancelled.value) return
        if (res.ok) setData(res.data ?? null)
        else setError(res.error?.message ?? 'Request failed')
      })
      .catch((err) => {
        if (cancelled.value) return
        setError(err instanceof Error ? err.message : 'Network error')
      })
      .finally(() => {
        if (!cancelled.value) setLoading(false)
      })
  }, [key])

  return { data, loading, error, refetch }
}

// ── Domain-specific fetch hooks ──

export function useProjectList(): FetchState<PaginatedList<ProjectItem>> & { refetch: () => void } {
  return useFetch<PaginatedList<ProjectItem>>('projects', () =>
    window.api.projectList({ page_size: 100 })
  )
}

export function usePlansForProject(
  projectId: number | null
): FetchState<PaginatedList<PlanItem>> & { refetch: () => void } {
  return useFetch<PaginatedList<PlanItem>>(projectId != null ? `plans-${projectId}` : null, () =>
    window.api.planList({ project_id: projectId!, page_size: 100 })
  )
}

export function useMaterials(
  planId: number | null
): FetchState<MaterialItem[]> & { refetch: () => void } {
  return useFetch<MaterialItem[]>(planId != null ? `materials-${planId}` : null, () =>
    window.api.materialList({ plan_id: planId! })
  )
}

export function useTaskDrafts(
  planId: number | null
): FetchState<TaskDraftItem[]> & { refetch: () => void } {
  return useFetch<TaskDraftItem[]>(planId != null ? `tasks-${planId}` : null, () =>
    window.api.taskList({ plan_id: planId! })
  )
}

// ── Status helpers ──

/**
 * Returns true when plan fields are editable.
 * Editable in `draft` and `ready` states.
 * Locked once plan enters `running` (or any terminal state).
 * Matches plan contract: "进入 running 后不可编辑".
 */
export function isPlanEditable(status: string | undefined | null): boolean {
  return status === 'draft' || status === 'ready'
}

export function planStatusVariant(
  status: string | undefined | null
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'draft':
      return 'outline'
    case 'ready':
      return 'default'
    case 'running':
      return 'destructive'
    case 'paused':
      return 'outline'
    case 'completed':
      return 'secondary'
    case 'blocked':
      return 'destructive'
    case 'stopped':
      return 'outline'
    default:
      return 'outline'
  }
}

export function materialTypeLabel(type: string): string {
  switch (type) {
    case 'requirements':
      return 'Requirements'
    case 'prototype':
      return 'Prototype'
    case 'api_spec':
      return 'API Spec'
    case 'note':
      return 'Note'
    default:
      return type
  }
}
