// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import {
  isErrorContent,
  messageMatchesFilter,
  filterMessages,
  computeFilterCounts,
  getRoleColor,
  formatTimestamp,
  formatLogsForExport,
  generateExportFilename,
  triggerFileDownload
} from '@/components/devconsole/utils'
import type { MessageOutput, FilterState } from '@/components/devconsole/types'

// ── Test Data ──

function makeMessage(overrides: Partial<MessageOutput> = {}): MessageOutput {
  return {
    id: 1,
    task_run_id: 100,
    correlation_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    role: 'assistant',
    content: 'Normal message content',
    created_at: '2026-04-02T12:00:00.000Z',
    updated_at: '2026-04-02T12:00:00.000Z',
    ...overrides
  }
}

const NO_FILTERS: FilterState = { error: false, opencode: false, system: false }

// ── isErrorContent ──

describe('isErrorContent', () => {
  it('detects error keyword in content', () => {
    expect(isErrorContent('Task failed with error')).toBe(true)
  })

  it('detects exception keyword', () => {
    expect(isErrorContent('NullPointer Exception occurred')).toBe(true)
  })

  it('detects stack trace keyword', () => {
    expect(isErrorContent('stack trace follows')).toBe(true)
  })

  it('detects timeout keyword', () => {
    expect(isErrorContent('Request timeout after 30s')).toBe(true)
  })

  it('detects crash keyword', () => {
    expect(isErrorContent('Process crashed unexpectedly')).toBe(true)
  })

  it('detects panic keyword', () => {
    expect(isErrorContent('Runtime panic: index out of bounds')).toBe(true)
  })

  it('detects failure keyword', () => {
    expect(isErrorContent('Build failure in module X')).toBe(true)
  })

  it('returns false for normal content', () => {
    expect(isErrorContent('Task completed successfully')).toBe(false)
  })

  it('returns false for empty content', () => {
    expect(isErrorContent('')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isErrorContent('ERROR: something went wrong')).toBe(true)
    expect(isErrorContent('Error: something went wrong')).toBe(true)
    expect(isErrorContent('error: something went wrong')).toBe(true)
  })
})

// ── messageMatchesFilter ──

describe('messageMatchesFilter', () => {
  it('returns true for all messages when no filters active', () => {
    const msg = makeMessage({ role: 'user', content: 'hello' })
    expect(messageMatchesFilter(msg, NO_FILTERS)).toBe(true)
  })

  it('matches opencode role when opencode filter active', () => {
    const msg = makeMessage({ role: 'opencode', content: 'sdk event' })
    expect(messageMatchesFilter(msg, { ...NO_FILTERS, opencode: true })).toBe(true)
  })

  it('matches system role when system filter active', () => {
    const msg = makeMessage({ role: 'system', content: 'init' })
    expect(messageMatchesFilter(msg, { ...NO_FILTERS, system: true })).toBe(true)
  })

  it('matches error content when error filter active', () => {
    const msg = makeMessage({ role: 'assistant', content: 'Task failed due to timeout' })
    expect(messageMatchesFilter(msg, { ...NO_FILTERS, error: true })).toBe(true)
  })

  it('rejects non-matching messages when filter active', () => {
    const msg = makeMessage({ role: 'user', content: 'normal input' })
    expect(messageMatchesFilter(msg, { ...NO_FILTERS, error: true })).toBe(false)
    expect(messageMatchesFilter(msg, { ...NO_FILTERS, opencode: true })).toBe(false)
    expect(messageMatchesFilter(msg, { ...NO_FILTERS, system: true })).toBe(false)
  })

  it('uses OR logic for multiple active filters', () => {
    const systemMsg = makeMessage({ role: 'system', content: 'init' })
    const errorMsg = makeMessage({ role: 'assistant', content: 'Build failure' })
    const normalMsg = makeMessage({ role: 'user', content: 'hello' })

    const filters: FilterState = { error: true, opencode: false, system: true }
    expect(messageMatchesFilter(systemMsg, filters)).toBe(true)
    expect(messageMatchesFilter(errorMsg, filters)).toBe(true)
    expect(messageMatchesFilter(normalMsg, filters)).toBe(false)
  })
})

// ── filterMessages ──

describe('filterMessages', () => {
  const messages: MessageOutput[] = [
    makeMessage({ id: 1, role: 'system', content: 'Starting task' }),
    makeMessage({ id: 2, role: 'opencode', content: 'Session created' }),
    makeMessage({ id: 3, role: 'assistant', content: 'Task failed with error' }),
    makeMessage({ id: 4, role: 'user', content: 'Please retry' }),
    makeMessage({ id: 5, role: 'opencode', content: 'Error: timeout exceeded' })
  ]

  it('returns all messages when no filters active', () => {
    expect(filterMessages(messages, NO_FILTERS)).toHaveLength(5)
  })

  it('filters to only opencode messages', () => {
    const result = filterMessages(messages, { ...NO_FILTERS, opencode: true })
    expect(result).toHaveLength(2)
    expect(result.every((m) => m.role === 'opencode')).toBe(true)
  })

  it('filters to only system messages', () => {
    const result = filterMessages(messages, { ...NO_FILTERS, system: true })
    expect(result).toHaveLength(1)
    expect(result[0].role).toBe('system')
  })

  it('filters to only error messages (content-based)', () => {
    const result = filterMessages(messages, { ...NO_FILTERS, error: true })
    // Messages 3 and 5 contain error-related content
    expect(result).toHaveLength(2)
  })

  it('combines multiple filters with OR logic', () => {
    const result = filterMessages(messages, { error: true, opencode: true, system: false })
    // error: 3, 5; opencode: 2, 5; union: 2, 3, 5
    expect(result).toHaveLength(3)
    const ids = result.map((m) => m.id)
    expect(ids).toContain(2)
    expect(ids).toContain(3)
    expect(ids).toContain(5)
  })

  it('returns empty array for empty input', () => {
    expect(filterMessages([], { ...NO_FILTERS, error: true })).toHaveLength(0)
  })
})

// ── computeFilterCounts ──

describe('computeFilterCounts', () => {
  it('counts correctly for mixed messages', () => {
    const messages: MessageOutput[] = [
      makeMessage({ id: 1, role: 'system', content: 'System init' }),
      makeMessage({ id: 2, role: 'system', content: 'Error detected' }),
      makeMessage({ id: 3, role: 'opencode', content: 'Session event' }),
      makeMessage({ id: 4, role: 'opencode', content: 'Error event received' }),
      makeMessage({ id: 5, role: 'assistant', content: 'Normal response' }),
      makeMessage({ id: 6, role: 'assistant', content: 'Task failure occurred' })
    ]

    const counts = computeFilterCounts(messages)
    expect(counts.error).toBe(3) // messages 2 (Error), 4 (Error), 6 (failure)
    expect(counts.opencode).toBe(2) // messages 3, 4
    expect(counts.system).toBe(2) // messages 1, 2
  })

  it('returns zeros for empty input', () => {
    const counts = computeFilterCounts([])
    expect(counts.error).toBe(0)
    expect(counts.opencode).toBe(0)
    expect(counts.system).toBe(0)
  })
})

// ── getRoleColor ──

describe('getRoleColor', () => {
  it('returns correct config for system role', () => {
    const color = getRoleColor('system')
    expect(color.label).toBe('System')
  })

  it('returns correct config for assistant role', () => {
    const color = getRoleColor('assistant')
    expect(color.label).toBe('Assistant')
  })

  it('returns correct config for opencode role', () => {
    const color = getRoleColor('opencode')
    expect(color.label).toBe('OpenCode')
  })

  it('returns correct config for user role', () => {
    const color = getRoleColor('user')
    expect(color.label).toBe('User')
  })

  it('returns assistant config for unknown role', () => {
    const color = getRoleColor('unknown_role')
    expect(color.label).toBe('Assistant')
  })
})

// ── formatTimestamp ──

describe('formatTimestamp', () => {
  it('formats ISO string to HH:MM:SS', () => {
    const result = formatTimestamp('2026-04-02T14:30:45.000Z')
    // Output depends on timezone, just check format
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('handles invalid input gracefully', () => {
    // new Date('not-a-date') produces "Invalid Date" in most environments
    expect(formatTimestamp('not-a-date')).toMatch(/Invalid Date|not-a-date/)
  })
})

// ── formatLogsForExport ──

describe('formatLogsForExport', () => {
  it('includes header with run ID and filter info', () => {
    const content = formatLogsForExport([], 42, NO_FILTERS)
    expect(content).toContain('Run ID: 42')
    expect(content).toContain('Filters: None')
  })

  it('includes active filter labels', () => {
    const content = formatLogsForExport([], 1, { error: true, opencode: false, system: true })
    expect(content).toContain('ERROR, SYSTEM')
  })

  it('includes message content', () => {
    const messages = [
      makeMessage({
        id: 1,
        role: 'system',
        content: 'Hello world',
        created_at: '2026-04-02T12:00:00.000Z'
      })
    ]
    const content = formatLogsForExport(messages, 1, NO_FILTERS)
    expect(content).toContain('Hello world')
    expect(content).toContain('SYSTEM')
    expect(content).toContain('Message count: 1')
  })

  it('produces valid content for empty filter (zero matches)', () => {
    const content = formatLogsForExport([], null, NO_FILTERS)
    expect(content).toContain('Run ID: N/A')
    expect(content).toContain('Message count: 0')
    expect(content).toContain('Total: 0 message(s)')
    // Must not be empty - should be a valid file
    expect(content.length).toBeGreaterThan(0)
  })
})

// ── generateExportFilename ──

describe('generateExportFilename', () => {
  it('includes run ID in filename', () => {
    const filename = generateExportFilename(42)
    expect(filename).toContain('run-42-')
  })

  it('includes "unknown" for null run ID', () => {
    const filename = generateExportFilename(null)
    expect(filename).toContain('run-unknown-')
  })

  it('ends with .txt', () => {
    const filename = generateExportFilename(1)
    expect(filename).toMatch(/\.txt$/)
  })
})

// ── triggerFileDownload (DOM test) ──

describe('triggerFileDownload', () => {
  it('creates and clicks a download link', () => {
    const content = 'test content'
    const filename = 'test.txt'

    // Mock URL.createObjectURL and URL.revokeObjectURL
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:test-url')
    URL.revokeObjectURL = vi.fn()

    // Mock createElement to capture the link
    const originalCreateElement = document.createElement.bind(document)
    const clickSpy = vi.fn()
    document.createElement = vi.fn((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    }) as typeof document.createElement

    triggerFileDownload(content, filename)

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(clickSpy).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url')

    // Restore
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    document.createElement = originalCreateElement
  })
})
