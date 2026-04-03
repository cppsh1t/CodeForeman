import type { MessageRole } from '@shared/types'

// ── Message Filter Types ──

export type MessageFilterKey = 'error' | 'opencode' | 'system'

export interface FilterState {
  error: boolean
  opencode: boolean
  system: boolean
}

export const FILTER_CONFIG: Record<MessageFilterKey, { label: string; description: string }> = {
  error: {
    label: 'Error',
    description: 'Show error-related messages'
  },
  opencode: {
    label: 'OpenCode',
    description: 'Show OpenCode SDK messages'
  },
  system: {
    label: 'System',
    description: 'Show system messages'
  }
} as const

// ── IPC Output Shapes ──
// Mirror the validated output shapes from IpcOutputMap for use in components.

export interface TaskRunOutput {
  id: number
  task_id: number
  status: 'running' | 'success' | 'failed' | 'cancelled'
  error_code: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface MessageOutput {
  id: number
  task_run_id: number
  correlation_id: string
  role: MessageRole
  content: string
  created_at: string
  updated_at: string
}

export interface PaginatedMessages {
  items: MessageOutput[]
  total: number
  page: number
  page_size: number
}

// ── Hook Return Types ──

export interface UseDevConsoleReturn {
  // Run data
  taskRuns: TaskRunOutput[]
  selectedRunId: number | null
  selectRun: (runId: number) => void
  isLoadingRuns: boolean
  runsError: string | null

  // Message data
  messages: MessageOutput[]
  filteredMessages: MessageOutput[]
  totalAvailable: number
  hasMore: boolean
  loadMore: () => void
  isLoadingMessages: boolean
  messagesError: string | null

  // Filters
  filters: FilterState
  toggleFilter: (key: MessageFilterKey) => void
  clearFilters: () => void
  filterCounts: Record<MessageFilterKey, number>
  activeFilterCount: number

  // Export
  exportLogs: () => void
}
