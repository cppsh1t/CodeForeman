import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import type {
  TaskRunOutput,
  MessageOutput,
  FilterState,
  MessageFilterKey,
  UseDevConsoleReturn
} from './types'
import {
  filterMessages,
  computeFilterCounts,
  formatLogsForExport,
  triggerFileDownload,
  generateExportFilename
} from './utils'

const PAGE_SIZE = 50

/**
 * Core hook for the dev console page.
 * Manages run selection, paginated message fetching, client-side filtering, and export.
 *
 * Uses incremental pagination: messages are fetched page-by-page as the user clicks
 * "Load more". Filters are applied client-side over accumulated messages. Counts
 * reflect the currently accumulated dataset.
 */
export function useDevConsole(planId: number | null): UseDevConsoleReturn {
  // ── Run state ──
  const [taskRuns, setTaskRuns] = useState<TaskRunOutput[]>([])
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [isLoadingRuns, setIsLoadingRuns] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)

  // ── Message state ──
  const [messages, setMessages] = useState<MessageOutput[]>([])
  const [totalAvailable, setTotalAvailable] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)

  // ── Filter state ──
  const [filters, setFilters] = useState<FilterState>({
    error: false,
    opencode: false,
    system: false
  })

  // Ref to track if component is mounted (prevent state updates after unmount)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => {
      mountedRef.current = false
    }
  }, [])

  // ── Fetch task runs when planId changes ──
  useEffect(() => {
    if (!planId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTaskRuns([])

      setRunsError(null)
      return
    }

    let cancelled = false
    setIsLoadingRuns(true)
    setRunsError(null)

    window.api
      .taskRunList({ plan_id: planId })
      .then((res) => {
        if (cancelled || !mountedRef.current) return
        if (res.ok) {
          setTaskRuns(res.data)
          // Auto-select the latest (last) run if none selected
          if (res.data.length > 0) {
            setSelectedRunId((prev) => (prev ? prev : res.data[res.data.length - 1].id))
          } else {
            setSelectedRunId(null)
          }
        } else {
          setRunsError(res.error.message)
        }
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return
        setRunsError(err instanceof Error ? err.message : 'Failed to fetch runs')
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setIsLoadingRuns(false)
      })

    return () => {
      cancelled = true
    }
  }, [planId])

  // ── Fetch messages when selectedRunId changes ──
  useEffect(() => {
    if (!selectedRunId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages([])
      setTotalAvailable(0)
      setCurrentPage(1)

      setMessagesError(null)
      return
    }

    let cancelled = false
    setIsLoadingMessages(true)
    setMessagesError(null)
    setMessages([])
    setCurrentPage(1)

    window.api
      .messageList({ task_run_id: selectedRunId, page: 1, page_size: PAGE_SIZE })
      .then((res) => {
        if (cancelled || !mountedRef.current) return
        if (res.ok) {
          setMessages(res.data.items)
          setTotalAvailable(res.data.total)
          setCurrentPage(1)
        } else {
          setMessagesError(res.error.message)
        }
      })
      .catch((err) => {
        if (cancelled || !mountedRef.current) return
        setMessagesError(err instanceof Error ? err.message : 'Failed to fetch messages')
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setIsLoadingMessages(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedRunId])

  // ── Derived state ──

  const filteredMessages = useMemo(() => filterMessages(messages, filters), [messages, filters])

  const filterCounts = useMemo(() => computeFilterCounts(messages), [messages])

  const hasMore = currentPage * PAGE_SIZE < totalAvailable

  const activeFilterCount = useMemo(
    () => [filters.error, filters.opencode, filters.system].filter(Boolean).length,
    [filters]
  )

  // ── Actions ──

  const selectRun = useCallback((runId: number) => {
    setSelectedRunId(runId)
  }, [])

  const loadMore = useCallback(() => {
    if (!selectedRunId || !hasMore || isLoadingMessages) return

    const nextPage = currentPage + 1
    setIsLoadingMessages(true)

    window.api
      .messageList({ task_run_id: selectedRunId, page: nextPage, page_size: PAGE_SIZE })
      .then((res) => {
        if (!mountedRef.current) return
        if (res.ok) {
          setMessages((prev) => [...prev, ...res.data.items])
          setCurrentPage(nextPage)
        } else {
          setMessagesError(res.error.message)
        }
      })
      .catch((err) => {
        if (!mountedRef.current) return
        setMessagesError(err instanceof Error ? err.message : 'Failed to load more messages')
      })
      .finally(() => {
        if (mountedRef.current) setIsLoadingMessages(false)
      })
  }, [selectedRunId, hasMore, isLoadingMessages, currentPage])

  const toggleFilter = useCallback((key: MessageFilterKey) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({ error: false, opencode: false, system: false })
  }, [])

  const exportLogs = useCallback(() => {
    const content = formatLogsForExport(filteredMessages, selectedRunId, filters)
    const filename = generateExportFilename(selectedRunId)
    triggerFileDownload(content, filename)
  }, [filteredMessages, selectedRunId, filters])

  return {
    taskRuns,
    selectedRunId,
    selectRun,
    isLoadingRuns,
    runsError,
    messages,
    filteredMessages,
    totalAvailable,
    hasMore,
    loadMore,
    isLoadingMessages,
    messagesError,
    filters,
    toggleFilter,
    clearFilters,
    filterCounts,
    activeFilterCount,
    exportLogs
  }
}
