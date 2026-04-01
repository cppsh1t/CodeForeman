# Structured Output

## Goal

Request validated JSON output by providing a JSON Schema in `format`.

## Basic Usage

```ts
const result = await client.session.prompt({
  path: { id: sessionId },
  body: {
    parts: [{ type: 'text', text: 'Research Anthropic and provide company info' }],
    format: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name' },
          founded: { type: 'number', description: 'Year founded' },
          products: {
            type: 'array',
            items: { type: 'string' },
            description: 'Main products'
          }
        },
        required: ['company', 'founded']
      }
    }
  }
})

console.log(result.data.info.structured_output)
```

## Output Format Types

| Type        | Description                         |
| ----------- | ----------------------------------- |
| text        | Default plain-text response         |
| json_schema | Validated JSON matching your schema |

## JSON Schema Format

When `format.type = "json_schema"`, provide:

| Field      | Type          | Description                              |
| ---------- | ------------- | ---------------------------------------- |
| type       | 'json_schema' | Required mode selector                   |
| schema     | object        | Required JSON Schema definition          |
| retryCount | number        | Optional validation retries (default: 2) |

## Error Handling

If validation keeps failing after retries, SDK returns `StructuredOutputError`:

```ts
if (result.data.info.error?.name === 'StructuredOutputError') {
  console.error('Failed to produce structured output:', result.data.info.error.message)
  console.error('Attempts:', result.data.info.error.retries)
}
```

## Best Practices

- Provide clear descriptions for each schema property.
- Use `required` for fields that must exist.
- Keep schemas simple and focused.
- Increase `retryCount` only when schema complexity requires it.
