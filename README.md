# elysia-mastra

A production-ready server adapter for running [Mastra](https://mastra.ai) with the [Elysia](https://elysiajs.com) web framework. This adapter enables you to integrate Mastra's AI agents, workflows, and tools into your Elysia applications while maintaining full type safety and leveraging Elysia's performance benefits.

## Features

- **Full Type Safety** - Properly typed context with `ElysiaContext` for route handlers - no more `as any`!
- **Complete Response Handling** - JSON, streaming (SSE/ndjson), AI SDK datastream, and MCP transport support
- **Production Ready** - Body size limits, request lifecycle management, comprehensive logging
- **Authentication** - Built-in auth middleware with per-route overrides via `customRouteAuthConfig`
- **Request Cancellation** - AbortSignal properly connected to request lifecycle
- **Stream Redaction** - Sensitive data automatically redacted from stream responses

## Installation

```bash
# Using bun (recommended)
bun add elysia-mastra

# Using npm
npm install elysia-mastra

# Using pnpm
pnpm add elysia-mastra
```

### Peer Dependencies

This package requires the following peer dependencies:

```bash
bun add elysia @mastra/server
```

## Quick Start

### Option 1: Using the `mastra()` Plugin (Recommended)

The simplest way - automatic type inference with no manual typing needed:

```typescript
import { Elysia } from 'elysia';
import { Mastra } from '@mastra/core';
import { mastra } from 'elysia-mastra';

const mastraInstance = new Mastra({});

const app = new Elysia()
  .use(mastra({ mastra: mastraInstance }))
  // Types are automatically inferred!
  .get('/info', ({ mastra, tools, requestContext }) => {
    return { status: 'ok' };
  })
  .get('/agents', ({ mastra }) => {
    return { agents: Object.keys(mastra.getAgents?.() ?? {}) };
  })
  .listen(3000);
```

### Option 2: Using `ElysiaServer` (Full Control)

For production setups with Mastra's built-in routes, auth, body limits, etc:

```typescript
import { Elysia } from 'elysia';
import { Mastra } from '@mastra/core';
import { ElysiaServer, mastra } from 'elysia-mastra';

const mastraInstance = new Mastra({});

// Use plugin for automatic type inference on custom routes
const app = new Elysia()
  .use(mastra({ mastra: mastraInstance }))
  .get('/health', () => ({ status: 'ok' }))
  .get('/info', ({ mastra, tools }) => ({
    // Automatically typed!
    toolCount: Object.keys(tools ?? {}).length,
  }));

// Use ElysiaServer for Mastra's built-in routes
const server = new ElysiaServer({
  app,
  mastra: mastraInstance,
  prefix: '/api',
});

// Just register routes (context already added by plugin)
await server.registerRoutes();

app.listen(3000);
```

## Type-Safe Context

### Automatic (with `mastra()` plugin)

```typescript
import { mastra } from 'elysia-mastra';

const app = new Elysia()
  .use(mastra({ mastra: myMastra }))
  // All properties are automatically typed - no manual typing!
  .get('/my-route', ({ mastra, tools, requestContext, abortSignal }) => {
    return { status: 'ok' };
  });
```

### Manual (with `ElysiaContext` type)

If you're not using the plugin, you can manually type handlers:

```typescript
import { type ElysiaContext } from 'elysia-mastra';

app.get('/my-route', (ctx: ElysiaContext) => {
  const { mastra, tools, requestContext, abortSignal, taskStore, user } = ctx;
  return { status: 'ok' };
});
```

## Configuration Options

The `ElysiaServer` constructor accepts the following options:

```typescript
const server = new ElysiaServer({
  // Required
  app: elysiaApp,
  mastra: mastraInstance,

  // Optional
  prefix: '/api',                    // Route prefix
  openapiPath: '/openapi.json',     // OpenAPI spec endpoint

  // Body size limits
  bodyLimitOptions: {
    maxSize: 5 * 1024 * 1024,       // 5MB
    onError: (err) => ({ error: err.message }),
  },

  // Stream configuration
  streamOptions: {
    redact: true,                    // Redact sensitive data (default: true)
  },

  // Custom tools
  tools: myCustomTools,

  // Task store for A2A
  taskStore: myTaskStore,

  // Production logging
  logger: {
    error: (msg, err) => console.error(msg, err),
    warn: (msg) => console.warn(msg),
    info: (msg) => console.info(msg),
    debug: (msg) => console.debug(msg),
  },

  // Per-route auth overrides
  customRouteAuthConfig: new Map([
    ['GET:/health', false],          // Public health check
    ['POST:/webhooks/*', false],     // Public webhooks (wildcard)
    ['ALL:/admin/*', true],          // Protected admin routes
  ]),
});
```

## Initialization

### Recommended: Using `init()`

```typescript
const server = new ElysiaServer({ app, mastra });
await server.init();
// Server is now ready with all middleware and routes registered
```

The `init()` method registers middleware and routes in the correct order:
1. Body limit middleware (if configured)
2. Context middleware (mastra, tools, requestContext, abortSignal)
3. Auth middleware (if auth is configured in Mastra)
4. All Mastra routes

### Manual Initialization

For custom middleware ordering, initialize manually:

```typescript
const server = new ElysiaServer({ app, mastra });

// 1. Body limit middleware (optional)
server.registerBodyLimitMiddleware();

// 2. Your early middleware
app.use(loggingMiddleware);

// 3. Mastra context middleware
server.registerContextMiddleware();

// 4. Your middleware that needs Mastra context
app.use(customMiddleware);

// 5. Auth middleware
server.registerAuthMiddleware();

// 6. Register routes
await server.registerRoutes();

// 7. Your routes
app.get('/custom', handler);
```

## Authentication

Configure authentication in Mastra and use per-route overrides:

```typescript
const mastra = new Mastra({
  server: {
    auth: {
      authenticateToken: async (token, request) => {
        // Validate token and return user or null
        return verifyJWT(token);
      },
      authorize: async (path, method, user, context) => {
        // Check if user can access this route
        return user?.role === 'admin' || method === 'GET';
      },
    },
  },
});

const server = new ElysiaServer({
  app,
  mastra,
  // Override auth for specific routes
  customRouteAuthConfig: new Map([
    ['GET:/health', false],           // No auth required
    ['POST:/webhooks/*', false],      // Webhooks are public (wildcard)
    ['ALL:/admin/*', true],           // Admin routes always need auth
  ]),
});
```

Authentication responses:
- `401 Unauthorized` - When authentication fails
- `403 Forbidden` - When authorization fails

## Response Types

The adapter handles all Mastra response types:

| Response Type | Description |
|--------------|-------------|
| `json` | Standard JSON response (auto-serialized by Elysia) |
| `stream` | SSE or ndjson streaming |
| `datastream-response` | AI SDK Response passthrough |
| `mcp-http` | MCP HTTP transport |
| `mcp-sse` | MCP SSE transport |

## Streaming

Streaming responses automatically:
- Set appropriate headers (`text/event-stream` for SSE, `text/plain` for ndjson)
- Apply redaction to sensitive data (when `streamOptions.redact: true`)
- Send completion markers (`data: [DONE]\n\n` for SSE)
- Handle errors gracefully

```typescript
// SSE format: data: {json}\n\n
// ndjson format: {json}\x1E (record separator)
```

## Request Cancellation

The `abortSignal` in context is connected to the request lifecycle:

```typescript
app.get('/long-task', async (ctx: ElysiaContext) => {
  const { abortSignal } = ctx;

  // Check if client disconnected
  if (abortSignal.aborted) {
    return { cancelled: true };
  }

  // Use in fetch calls
  const response = await fetch(url, { signal: abortSignal });

  // Listen for cancellation
  abortSignal.addEventListener('abort', () => {
    cleanup();
  });
});
```

## Logger Interface

Implement custom logging for production:

```typescript
import { type MastraLogger } from 'elysia-mastra';

const logger: MastraLogger = {
  error: (message, error) => myLogger.error(message, error),
  warn: (message) => myLogger.warn(message),
  info: (message) => myLogger.info(message),
  debug: (message) => myLogger.debug?.(message),
};
```

## Error Handling

The adapter provides consistent error responses:

```typescript
// Validation errors (400)
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [/* Zod error details */]
}

// Authentication errors (401)
{
  "error": "Unauthorized"
}

// Authorization errors (403)
{
  "error": "Forbidden"
}

// Internal errors (500) - details hidden for security
{
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred"
}
```

## OpenAPI Support

Enable OpenAPI documentation by setting the `openapiPath` option:

```typescript
const server = new ElysiaServer({
  app,
  mastra,
  openapiPath: '/openapi.json',
});

// Access the OpenAPI spec at http://localhost:3000/openapi.json
```

The generated spec includes all Mastra routes with their Zod schemas converted to OpenAPI format.

## Type Exports

```typescript
import {
  // Server class
  ElysiaServer,

  // Context types
  type ElysiaContext,           // Full context for route handlers
  type ElysiaWithMastra,        // Typed Elysia app with Mastra
  type MastraDeriveContext,     // Core derived context
  type MastraAuthContext,       // Auth-specific context
  type MastraFullContext,       // Combined context

  // Configuration types
  type ElysiaServerOptions,
  type BodyLimitOptions,
  type StreamOptions,
  type MastraLogger,
  type ExtractedParams,

  // Re-exported Mastra types
  type Mastra,
  type ToolsInput,
  type RequestContext,
  type InMemoryTaskStore,
} from 'elysia-mastra';
```

## API Reference

### ElysiaServer

The main adapter class that extends `MastraServer`.

#### Constructor

```typescript
new ElysiaServer(options: ElysiaServerOptions)
```

#### Methods

| Method | Description |
|--------|-------------|
| `init()` | Initializes all middleware and routes (recommended) |
| `registerBodyLimitMiddleware()` | Registers body size limit middleware |
| `registerContextMiddleware()` | Attaches Mastra context to all requests |
| `registerAuthMiddleware()` | Registers authentication/authorization middleware |
| `registerRoutes()` | Registers all Mastra routes |
| `registerRoute(app, route, options)` | Registers a single Mastra route |
| `getParams(route, request)` | Extracts URL, query, and body parameters |
| `sendResponse(route, response, result)` | Sends response based on route type |
| `stream(route, response, result)` | Handles streaming responses |
| `getApp()` | Returns the Elysia app instance |

## Examples

See the `examples/` directory for complete examples:

- **basic-setup** - Minimal setup with proper typing
- **with-authentication** - JWT auth with per-route overrides
- **custom-tools** - Creating and using custom tools
- **streaming-responses** - SSE, ndjson, and WebSocket streaming
- **openapi-integration** - Swagger/OpenAPI documentation

## License

MIT
