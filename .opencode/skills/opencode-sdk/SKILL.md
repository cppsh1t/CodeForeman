---
name: opencode-sdk
description: OpenCode JS/TS SDK integration guidance. Use when implementing @opencode-ai/sdk flows including createOpencode/createOpencodeClient setup, JSON Schema structured output, Session/Files/Config/TUI/Auth/Events API calls, SDK type imports, or SDK error handling patterns.
---

# OpenCode SDK

## Overview

Use this skill to implement or troubleshoot OpenCode JS/TS SDK workflows with consistent patterns and minimal context overhead. Keep execution focused on setup mode selection, structured output correctness, and precise API method usage.

## Quick Start Workflow

1. Install SDK.
2. Choose connection mode:
   - Use `createOpencode()` when you need to start server + client together.
   - Use `createOpencodeClient()` when a server is already running.
3. Implement request flow via typed client APIs.
4. If structured output is needed, use `format.type = "json_schema"` with a concise schema.
5. Handle SDK errors and structured output validation errors explicitly.

## Install

```bash
npm install @opencode-ai/sdk
```

## Choose Client Mode

### Full Mode (start server + client)

```ts
import { createOpencode } from '@opencode-ai/sdk'

const { client } = await createOpencode()
```

Use options as needed: `hostname`, `port`, `signal`, `timeout`, `config`.

### Client-Only Mode (connect to existing server)

```ts
import { createOpencodeClient } from '@opencode-ai/sdk'

const client = createOpencodeClient({
  baseUrl: 'http://localhost:4096'
})
```

Use options as needed: `baseUrl`, `fetch`, `parseAs`, `responseStyle`, `throwOnError`.

## Use Structured Output Correctly

1. Call `client.session.prompt()` with `body.format`.
2. Set `format.type` to `json_schema`.
3. Provide `format.schema` with clear property descriptions.
4. Read validated result from `result.data.info.structured_output`.
5. Handle `StructuredOutputError` when retries are exhausted.

For complete schema patterns and error handling, read:

- `references/structured-output.md`

## Import SDK Types

```ts
import type { Session, Message, Part } from '@opencode-ai/sdk'
```

## Handle Errors Explicitly

```ts
try {
  await client.session.get({ path: { id: 'invalid-id' } })
} catch (error) {
  console.error('Failed to get session:', (error as Error).message)
}
```

## Reference Navigation

- Client setup details and options: `references/client-setup.md`
- Structured output guide: `references/structured-output.md`
- Complete API catalog and examples: `references/api-reference.md`

## Operating Rules

- Prefer the smallest API surface that solves the task.
- Keep JSON Schema simple; add complexity only when required.
- Use `required` fields to enforce output guarantees.
- Treat `noReply: true` as context injection only.
