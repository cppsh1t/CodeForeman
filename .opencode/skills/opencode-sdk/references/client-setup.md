# Client Setup

## Overview

Use the OpenCode JS/TS SDK to control OpenCode programmatically with a type-safe client.

## Install

```bash
npm install @opencode-ai/sdk
```

## Start Server + Client Together

```ts
import { createOpencode } from '@opencode-ai/sdk'

const { client } = await createOpencode()
```

This mode starts both server and client.

### Options

| Option   | Type        | Description                   | Default   |
| -------- | ----------- | ----------------------------- | --------- |
| hostname | string      | Server hostname               | 127.0.0.1 |
| port     | number      | Server port                   | 4096      |
| signal   | AbortSignal | Abort signal for cancellation | undefined |
| timeout  | number      | Server start timeout (ms)     | 5000      |
| config   | Config      | Inline config object          | {}        |

## Configure Inline Overrides

```ts
import { createOpencode } from '@opencode-ai/sdk'

const opencode = await createOpencode({
  hostname: '127.0.0.1',
  port: 4096,
  config: {
    model: 'anthropic/claude-3-5-sonnet-20241022'
  }
})

console.log(`Server running at ${opencode.server.url}`)
opencode.server.close()
```

## Connect to Existing Server (Client-Only)

```ts
import { createOpencodeClient } from '@opencode-ai/sdk'

const client = createOpencodeClient({
  baseUrl: 'http://localhost:4096'
})
```

### Options

| Option        | Type     | Description                       | Default               |
| ------------- | -------- | --------------------------------- | --------------------- |
| baseUrl       | string   | Server URL                        | http://localhost:4096 |
| fetch         | function | Custom fetch implementation       | globalThis.fetch      |
| parseAs       | string   | Response parsing mode             | auto                  |
| responseStyle | string   | Return style: `data` or `fields`  | fields                |
| throwOnError  | boolean  | Throw instead of returning errors | false                 |

## Import SDK Types

```ts
import type { Session, Message, Part } from '@opencode-ai/sdk'
```

All types are generated from the server OpenAPI spec.

## Handle SDK Errors

```ts
try {
  await client.session.get({ path: { id: 'invalid-id' } })
} catch (error) {
  console.error('Failed to get session:', (error as Error).message)
}
```
