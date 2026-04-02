// ── Baseline integration smoke test ──
//
// Integration tests exercise module boundaries crossing @shared into
// both node and web contexts. This file proves the test runner can
// import and exercise the shared domain contracts end-to-end.

import { describe, it, expect } from 'vitest'

describe('shared domain contracts integration', () => {
  it('import and validate all status enums from barrel', async () => {
    const types = await import('@shared/types')

    // All status consts use UPPERCASE keys (e.g. ProjectStatus.ACTIVE)
    expect(types.ProjectStatus.ACTIVE).toBe('active')
    expect(types.ProjectStatus.ARCHIVED).toBe('archived')

    expect(types.PlanStatus.DRAFT).toBe('draft')
    expect(types.PlanStatus.READY).toBe('ready')

    expect(types.TaskStatus.PENDING).toBe('pending')
    expect(types.TaskStatus.RUNNING).toBe('running')

    expect(types.TaskRunStatus.RUNNING).toBe('running')
    expect(types.TaskRunStatus.SUCCESS).toBe('success')

    expect(types.MessageRole.USER).toBe('user')
    expect(types.TriggerType.FAILURE).toBe('failure')
    expect(types.ThinkDecisionType.CONTINUE_NEXT).toBe('continue_next')
    expect(types.MaterialType.REQUIREMENTS).toBe('requirements')
    expect(types.MaterialSource.MANUAL).toBe('manual')
  })

  it('generateCorrelationId produces valid UUID', async () => {
    const { generateCorrelationId, isCorrelationId } = await import('@shared/types/correlation')
    const id = generateCorrelationId()
    expect(isCorrelationId(id)).toBe(true)
  })
})
