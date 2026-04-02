// ── Correlation ID: uniquely identifies a task-run execution ──
//
// Rules:
//  - Format: UUID v4 (lowercase, 8-4-4-4-12 hex groups)
//  - Generated at task-run creation, immutable thereafter
//  - Propagates to all child RunMessages and ThinkDecisions
//  - Used for log correlation and retry deduplication

declare const __brand: unique symbol
export type CorrelationId = string & { readonly [__brand]: 'CorrelationId' }

/** UUID v4 regex pattern */
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Type guard: check if a string conforms to CorrelationId format */
export function isCorrelationId(value: string): value is CorrelationId {
  return UUID_V4_RE.test(value)
}

/** Generate a new CorrelationId using crypto.randomUUID (available in both Node ≥19 and modern browsers) */
export function generateCorrelationId(): CorrelationId {
  const raw = crypto.randomUUID()
  return raw as CorrelationId
}
