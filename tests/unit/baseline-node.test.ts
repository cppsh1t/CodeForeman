// ── Baseline smoke test: proves vitest node environment resolves and executes ──

import { describe, it, expect } from 'vitest'
import { ProjectStatus } from '@shared/types/project'

describe('vitest node environment', () => {
  it('runs a passing assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('resolves @shared path alias', () => {
    expect(ProjectStatus.ACTIVE).toBe('active')
    expect(ProjectStatus.ARCHIVED).toBe('archived')
  })
})
