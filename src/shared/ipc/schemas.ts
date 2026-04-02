// ── IPC Schema Validation ──
//
// Zod schemas for every IPC channel's input and output.
// These are the runtime guard that enforce payload constraints at the boundary.
// The main dispatcher validates input before calling handlers and validates
// output before sending to renderer.

import { z } from 'zod'
import {
  ProjectStatus,
  PlanStatus,
  MaterialType,
  MaterialSource,
  TaskStatus,
  MessageRole,
  TriggerType,
  ThinkDecisionType,
  ErrorCode
} from '../types'
import { MAX_STRING_LENGTH, MAX_CONTENT_LENGTH, MAX_PAGE_SIZE } from './types'
import {
  PROJECT_CREATE,
  PROJECT_LIST,
  PROJECT_GET,
  PROJECT_UPDATE,
  PROJECT_ARCHIVE,
  PLAN_CREATE,
  PLAN_LIST,
  PLAN_GET,
  PLAN_UPDATE,
  PLAN_SET_READY,
  MATERIAL_CREATE,
  MATERIAL_LIST,
  MATERIAL_DELETE,
  TASK_CREATE,
  TASK_LIST,
  TASK_GET,
  TASK_UPDATE,
  EXECUTION_START,
  EXECUTION_PAUSE,
  EXECUTION_RESUME,
  EXECUTION_STOP,
  TASK_RUN_GET,
  TASK_RUN_LIST,
  THINK_SUBMIT,
  MESSAGE_LIST
} from './channels'

// ── Shared Primitives ──

/** Constrained string: non-empty, max 10 000 chars. */
const shortString = z.string().min(1).max(MAX_STRING_LENGTH)

/** Constrained string for content fields: max 100 000 chars. */
const contentString = z.string().max(MAX_CONTENT_LENGTH)

/** Positive integer ID (branded types stripped at boundary). */
const id = z.number().int().positive()

/** Pagination params. */
const pagination = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(MAX_PAGE_SIZE).default(20)
})

// ── Enum validators (runtime-accessible const values) ──

const projectStatusEnum = z.enum([ProjectStatus.ACTIVE, ProjectStatus.ARCHIVED])

const planStatusEnum = z.enum([
  PlanStatus.DRAFT,
  PlanStatus.READY,
  PlanStatus.RUNNING,
  PlanStatus.PAUSED,
  PlanStatus.COMPLETED,
  PlanStatus.BLOCKED,
  PlanStatus.STOPPED
])

const materialTypeEnum = z.enum([
  MaterialType.REQUIREMENTS,
  MaterialType.PROTOTYPE,
  MaterialType.API_SPEC,
  MaterialType.NOTE
])

const materialSourceEnum = z.enum([MaterialSource.MANUAL, MaterialSource.IMPORT])

const taskStatusEnum = z.enum([
  TaskStatus.PENDING,
  TaskStatus.RUNNING,
  TaskStatus.SUCCESS,
  TaskStatus.FAILED,
  TaskStatus.BLOCKED,
  TaskStatus.SKIPPED
])

const messageRoleEnum = z.enum([
  MessageRole.SYSTEM,
  MessageRole.ASSISTANT,
  MessageRole.OPENCODE,
  MessageRole.USER
])

const triggerTypeEnum = z.enum([TriggerType.FAILURE, TriggerType.USER_FORCE, TriggerType.INTERVAL])

const thinkDecisionTypeEnum = z.enum([
  ThinkDecisionType.CONTINUE_NEXT,
  ThinkDecisionType.RETRY_CURRENT,
  ThinkDecisionType.REORDER,
  ThinkDecisionType.STOP_PLAN
])

const errorCodeEnum = z.enum([
  ErrorCode.UNKNOWN,
  ErrorCode.INVALID_INPUT,
  ErrorCode.NOT_FOUND,
  ErrorCode.TASK_EXECUTION_FAILED,
  ErrorCode.TASK_TIMEOUT,
  ErrorCode.IPC_CHANNEL_ERROR,
  ErrorCode.IPC_TIMEOUT,
  ErrorCode.DB_ERROR,
  ErrorCode.DB_CONSTRAINT,
  ErrorCode.AI_API_ERROR,
  ErrorCode.AI_RATE_LIMITED,
  ErrorCode.AI_CONTEXT_TOO_LONG,
  ErrorCode.AUTH_ERROR,
  ErrorCode.AUTH_EXPIRED
])

// ── Per-Channel Schema Definitions ──
//
// Structure: { input: ZodSchema, output: ZodSchema }
// Input is validated on the main process side (before handler).
// Output is validated on the main process side (before returning to renderer).

export const schemas = {
  // ---------------------------------------------------------------------------
  // Project
  // ---------------------------------------------------------------------------
  [PROJECT_CREATE]: {
    input: z.object({
      name: shortString,
      description: z.string().max(MAX_STRING_LENGTH).default('')
    }),
    output: z.object({ id })
  },

  [PROJECT_LIST]: {
    input: pagination,
    output: z.object({
      items: z.array(
        z.object({
          id,
          name: z.string(),
          description: z.string(),
          status: projectStatusEnum,
          created_at: z.string(),
          updated_at: z.string()
        })
      ),
      total: z.number().int().nonnegative(),
      page: z.number().int().min(1),
      page_size: z.number().int().min(1)
    })
  },

  [PROJECT_GET]: {
    input: z.object({ id }),
    output: z.object({
      id,
      name: z.string(),
      description: z.string(),
      status: projectStatusEnum,
      created_at: z.string(),
      updated_at: z.string()
    })
  },

  [PROJECT_UPDATE]: {
    input: z.object({
      id,
      name: shortString.optional(),
      description: z.string().max(MAX_STRING_LENGTH).optional()
    }),
    output: z.object({ id })
  },

  [PROJECT_ARCHIVE]: {
    input: z.object({ id }),
    output: z.object({ id })
  },

  // ---------------------------------------------------------------------------
  // Plan
  // ---------------------------------------------------------------------------
  [PLAN_CREATE]: {
    input: z.object({
      project_id: id,
      name: shortString,
      description: z.string().max(MAX_STRING_LENGTH).default('')
    }),
    output: z.object({ id })
  },

  [PLAN_LIST]: {
    input: z.object({ project_id: id }).merge(pagination),
    output: z.object({
      items: z.array(
        z.object({
          id,
          project_id: id,
          name: z.string(),
          description: z.string(),
          status: planStatusEnum,
          created_at: z.string(),
          updated_at: z.string()
        })
      ),
      total: z.number().int().nonnegative(),
      page: z.number().int().min(1),
      page_size: z.number().int().min(1)
    })
  },

  [PLAN_GET]: {
    input: z.object({ id }),
    output: z.object({
      id,
      project_id: id,
      name: z.string(),
      description: z.string(),
      status: planStatusEnum,
      created_at: z.string(),
      updated_at: z.string()
    })
  },

  [PLAN_UPDATE]: {
    input: z.object({
      id,
      name: shortString.optional(),
      description: z.string().max(MAX_STRING_LENGTH).optional()
    }),
    output: z.object({ id })
  },

  [PLAN_SET_READY]: {
    input: z.object({ id }),
    output: z.object({ id })
  },

  // ---------------------------------------------------------------------------
  // PlanMaterial
  // ---------------------------------------------------------------------------
  [MATERIAL_CREATE]: {
    input: z.object({
      plan_id: id,
      type: materialTypeEnum,
      source: materialSourceEnum.default(MaterialSource.MANUAL),
      content: contentString
    }),
    output: z.object({ id })
  },

  [MATERIAL_LIST]: {
    input: z.object({ plan_id: id }),
    output: z.array(
      z.object({
        id,
        plan_id: id,
        type: materialTypeEnum,
        source: materialSourceEnum,
        content: z.string(),
        created_at: z.string(),
        updated_at: z.string()
      })
    )
  },

  [MATERIAL_DELETE]: {
    input: z.object({ id }),
    output: z.object({ id })
  },

  // ---------------------------------------------------------------------------
  // Task
  // ---------------------------------------------------------------------------
  [TASK_CREATE]: {
    input: z.object({
      plan_id: id,
      tasks: z
        .array(
          z.object({
            name: shortString,
            description: z.string().max(MAX_STRING_LENGTH).default(''),
            order_index: z.number().int().min(0)
          })
        )
        .min(1)
        .max(50)
    }),
    output: z.object({
      ids: z.array(id)
    })
  },

  [TASK_LIST]: {
    input: z.object({ plan_id: id }),
    output: z.array(
      z.object({
        id,
        plan_id: id,
        name: z.string(),
        description: z.string(),
        status: taskStatusEnum,
        order_index: z.number().int().min(0),
        created_at: z.string(),
        updated_at: z.string()
      })
    )
  },

  [TASK_GET]: {
    input: z.object({ id }),
    output: z.object({
      id,
      plan_id: id,
      name: z.string(),
      description: z.string(),
      status: taskStatusEnum,
      order_index: z.number().int().min(0),
      created_at: z.string(),
      updated_at: z.string()
    })
  },

  [TASK_UPDATE]: {
    input: z.object({
      id,
      name: shortString.optional(),
      description: z.string().max(MAX_STRING_LENGTH).optional(),
      status: taskStatusEnum.optional()
    }),
    output: z.object({ id })
  },

  // ---------------------------------------------------------------------------
  // Execution control
  // ---------------------------------------------------------------------------
  [EXECUTION_START]: {
    input: z.object({ plan_id: id }),
    output: z.object({ plan_id: id })
  },

  [EXECUTION_PAUSE]: {
    input: z.object({ plan_id: id }),
    output: z.object({ plan_id: id })
  },

  [EXECUTION_RESUME]: {
    input: z.object({ plan_id: id }),
    output: z.object({ plan_id: id })
  },

  [EXECUTION_STOP]: {
    input: z.object({ plan_id: id }),
    output: z.object({ plan_id: id })
  },

  // ---------------------------------------------------------------------------
  // TaskRun
  // ---------------------------------------------------------------------------
  [TASK_RUN_GET]: {
    input: z.object({ id }),
    output: z.object({
      id,
      task_id: id,
      status: z.enum(['running', 'success', 'failed', 'cancelled']),
      error_code: errorCodeEnum.nullable(),
      started_at: z.string().nullable(),
      finished_at: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string()
    })
  },

  [TASK_RUN_LIST]: {
    input: z.object({ plan_id: id }),
    output: z.array(
      z.object({
        id,
        task_id: id,
        status: z.enum(['running', 'success', 'failed', 'cancelled']),
        error_code: errorCodeEnum.nullable(),
        started_at: z.string().nullable(),
        finished_at: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string()
      })
    )
  },

  // ---------------------------------------------------------------------------
  // ThinkDecision
  // ---------------------------------------------------------------------------
  [THINK_SUBMIT]: {
    input: z.object({
      task_run_id: id,
      trigger_type: triggerTypeEnum,
      decision: thinkDecisionTypeEnum,
      reason: shortString
    }),
    output: z.object({ id })
  },

  // ---------------------------------------------------------------------------
  // RunMessage
  // ---------------------------------------------------------------------------
  [MESSAGE_LIST]: {
    input: z.object({ task_run_id: id }).merge(pagination),
    output: z.object({
      items: z.array(
        z.object({
          id,
          task_run_id: id,
          correlation_id: z.string(),
          role: messageRoleEnum,
          content: z.string(),
          created_at: z.string(),
          updated_at: z.string()
        })
      ),
      total: z.number().int().nonnegative(),
      page: z.number().int().min(1),
      page_size: z.number().int().min(1)
    })
  }
} as const

// ── Derived Types ──

/** Map of channel → input type (what the caller passes — defaults are optional). */
export type IpcInputMap = {
  [K in keyof typeof schemas]: z.input<(typeof schemas)[K]['input']>
}

/** Map of channel → output type (what the handler returns after parsing). */
export type IpcOutputMap = {
  [K in keyof typeof schemas]: z.infer<(typeof schemas)[K]['output']>
}
