import type { MessageOutput, MessageFilterKey, FilterState } from './types'

// ── Error Detection Heuristic ──
// Since there is no dedicated "is_error" field on RunMessage, we detect errors
// via content pattern matching. This is a pragmatic client-side heuristic.

const ERROR_PATTERNS = [
  /\berror\b/i,
  /\bfail(?:ed|ure)?\b/i,
  /\bexception\b/i,
  /\bstack\s*trace\b/i,
  /\btimeout\b/i,
  /\bcrash(?:ed)?\b/i,
  /\bpanic\b/i
]

export function isErrorContent(content: string): boolean {
  return ERROR_PATTERNS.some((pattern) => pattern.test(content))
}

// ── Message Filtering ──

export function messageMatchesFilter(message: MessageOutput, filters: FilterState): boolean {
  const anyActive = filters.error || filters.opencode || filters.system
  if (!anyActive) return true // no filters = show all

  if (filters.opencode && message.role === 'opencode') return true
  if (filters.system && message.role === 'system') return true
  if (filters.error && isErrorContent(message.content)) return true

  return false
}

export function filterMessages(messages: MessageOutput[], filters: FilterState): MessageOutput[] {
  return messages.filter((msg) => messageMatchesFilter(msg, filters))
}

export function computeFilterCounts(messages: MessageOutput[]): Record<MessageFilterKey, number> {
  return {
    error: messages.filter((m) => isErrorContent(m.content)).length,
    opencode: messages.filter((m) => m.role === 'opencode').length,
    system: messages.filter((m) => m.role === 'system').length
  }
}

// ── Role Color Mapping ──
// Maps message roles to Tailwind color classes for the dark theme.

export interface RoleColorConfig {
  text: string
  bg: string
  border: string
  dot: string
  label: string
}

export const ROLE_COLORS: Record<string, RoleColorConfig> = {
  system: {
    text: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    dot: 'bg-blue-400',
    label: 'System'
  },
  assistant: {
    text: 'text-foreground',
    bg: 'bg-muted/50',
    border: 'border-border',
    dot: 'bg-muted-foreground',
    label: 'Assistant'
  },
  opencode: {
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    label: 'OpenCode'
  },
  user: {
    text: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    label: 'User'
  }
}

export function getRoleColor(role: string): RoleColorConfig {
  return ROLE_COLORS[role] ?? ROLE_COLORS.assistant
}

// ── Timestamp Formatting ──

export function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return isoString
  }
}

// ── Export Helpers ──

export function formatLogsForExport(
  messages: MessageOutput[],
  runId: number | null,
  filters: FilterState
): string {
  const activeFilterLabels = (Object.entries(filters) as [MessageFilterKey, boolean][])
    .filter(([, active]) => active)
    .map(([key]) => key.toUpperCase())

  const lines: string[] = [
    'CodeForeman Run Log Export',
    '============================',
    `Run ID: ${runId ?? 'N/A'}`,
    `Exported: ${new Date().toISOString()}`,
    `Filters: ${activeFilterLabels.length > 0 ? activeFilterLabels.join(', ') : 'None (all messages)'}`,
    `Message count: ${messages.length}`,
    '',
    '---',
    ''
  ]

  for (const msg of messages) {
    const ts = formatTimestamp(msg.created_at)
    const role = msg.role.toUpperCase().padEnd(10)
    const corrId =
      msg.correlation_id.length > 8 ? msg.correlation_id.slice(0, 8) + '...' : msg.correlation_id
    lines.push(`[${ts}] [${role}] [${corrId}]`)
    lines.push(msg.content)
    lines.push('')
  }

  lines.push('---')
  lines.push(`Total: ${messages.length} message(s)`)

  return lines.join('\n')
}

export function triggerFileDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function generateExportFilename(runId: number | null): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `run-${runId ?? 'unknown'}-logs-${ts}.txt`
}
