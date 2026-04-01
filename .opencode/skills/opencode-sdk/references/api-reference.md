# API Reference

## Table of Contents

- Global
- App
- Project
- Path
- Config
- Sessions
- Files
- TUI
- Auth
- Events

## Global

| Method          | Description                     | Response                             |
| --------------- | ------------------------------- | ------------------------------------ |
| global.health() | Check server health and version | `{ healthy: true, version: string }` |

```ts
const health = await client.global.health()
console.log(health.data.version)
```

## App

| Method       | Description           | Response |
| ------------ | --------------------- | -------- |
| app.log()    | Write a log entry     | boolean  |
| app.agents() | List available agents | Agent[]  |

```ts
await client.app.log({
  body: {
    service: 'my-app',
    level: 'info',
    message: 'Operation completed'
  }
})

const agents = await client.app.agents()
```

## Project

| Method            | Description         | Response  |
| ----------------- | ------------------- | --------- |
| project.list()    | List all projects   | Project[] |
| project.current() | Get current project | Project   |

```ts
const projects = await client.project.list()
const currentProject = await client.project.current()
```

## Path

| Method     | Description           | Response |
| ---------- | --------------------- | -------- |
| path.get() | Get current path info | Path     |

```ts
const pathInfo = await client.path.get()
```

## Config

| Method             | Description          | Response                                                     |
| ------------------ | -------------------- | ------------------------------------------------------------ |
| config.get()       | Get config           | Config                                                       |
| config.providers() | Providers + defaults | `{ providers: Provider[], default: Record<string, string> }` |

```ts
const config = await client.config.get()
const { providers, default: defaults } = await client.config.providers()
```

## Sessions

| Method                                                   | Description                      | Notes                                               |
| -------------------------------------------------------- | -------------------------------- | --------------------------------------------------- |
| session.list()                                           | List sessions                    | Returns Session[]                                   |
| session.get({ path })                                    | Get session                      | Returns Session                                     |
| session.children({ path })                               | List child sessions              | Returns Session[]                                   |
| session.create({ body })                                 | Create session                   | Returns Session                                     |
| session.delete({ path })                                 | Delete session                   | Returns boolean                                     |
| session.update({ path, body })                           | Update session                   | Returns Session                                     |
| session.init({ path, body })                             | Analyze app and create AGENTS.md | Returns boolean                                     |
| session.abort({ path })                                  | Abort running session            | Returns boolean                                     |
| session.share({ path })                                  | Share session                    | Returns Session                                     |
| session.unshare({ path })                                | Unshare session                  | Returns Session                                     |
| session.summarize({ path, body })                        | Summarize session                | Returns boolean                                     |
| session.messages({ path })                               | List messages                    | Returns `{ info: Message, parts: Part[] }[]`        |
| session.message({ path })                                | Get one message                  | Returns `{ info: Message, parts: Part[] }`          |
| session.prompt({ path, body })                           | Send prompt                      | `noReply: true` only injects context                |
| session.command({ path, body })                          | Send command                     | Returns `{ info: AssistantMessage, parts: Part[] }` |
| session.shell({ path, body })                            | Run shell command                | Returns AssistantMessage                            |
| session.revert({ path, body })                           | Revert message                   | Returns Session                                     |
| session.unrevert({ path })                               | Restore reverted message         | Returns Session                                     |
| postSessionByIdPermissionsByPermissionId({ path, body }) | Respond to permission request    | Returns boolean                                     |

```ts
const session = await client.session.create({
  body: { title: 'My session' }
})

const result = await client.session.prompt({
  path: { id: session.id },
  body: {
    model: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet-20241022' },
    parts: [{ type: 'text', text: 'Hello!' }]
  }
})
```

## Files

| Method                  | Description                    | Response                                                                 |
| ----------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| find.text({ query })    | Search text in files           | Match objects with path, lines, line_number, absolute_offset, submatches |
| find.files({ query })   | Find files/directories by name | string[]                                                                 |
| find.symbols({ query }) | Find workspace symbols         | Symbol[]                                                                 |
| file.read({ query })    | Read file                      | `{ type: "raw" \| "patch", content: string }`                            |
| file.status({ query? }) | Get tracked file status        | File[]                                                                   |

`find.files` query options:

- `type`: `"file"` or `"directory"`
- `directory`: override project root
- `limit`: `1-200`

```ts
const textResults = await client.find.text({
  query: { pattern: 'function.*opencode' }
})

const files = await client.find.files({
  query: { query: '*.ts', type: 'file' }
})
```

## TUI

| Method                       | Description            | Response |
| ---------------------------- | ---------------------- | -------- |
| tui.appendPrompt({ body })   | Append prompt text     | boolean  |
| tui.openHelp()               | Open help dialog       | boolean  |
| tui.openSessions()           | Open sessions selector | boolean  |
| tui.openThemes()             | Open themes selector   | boolean  |
| tui.openModels()             | Open models selector   | boolean  |
| tui.submitPrompt()           | Submit prompt          | boolean  |
| tui.clearPrompt()            | Clear prompt           | boolean  |
| tui.executeCommand({ body }) | Execute command        | boolean  |
| tui.showToast({ body })      | Show toast             | boolean  |

```ts
await client.tui.appendPrompt({
  body: { text: 'Add this to prompt' }
})

await client.tui.showToast({
  body: { message: 'Task completed', variant: 'success' }
})
```

## Auth

| Method            | Description          | Response |
| ----------------- | -------------------- | -------- |
| auth.set({ ... }) | Set auth credentials | boolean  |

```ts
await client.auth.set({
  path: { id: 'anthropic' },
  body: { type: 'api', key: 'your-api-key' }
})
```

## Events

| Method            | Description              | Response |
| ----------------- | ------------------------ | -------- |
| event.subscribe() | Server-sent event stream | stream   |

```ts
const events = await client.event.subscribe()
for await (const event of events.stream) {
  console.log('Event:', event.type, event.properties)
}
```
