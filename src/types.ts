import type { Context, AnyElysia } from 'elysia';
import type { Mastra } from '@mastra/core/mastra';
import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { InMemoryTaskStore } from '@mastra/server/a2a/store';

// ============================================================================
// Logger Types
// ============================================================================

/**
 * Logger interface for production debugging and monitoring.
 * Implement this interface to integrate with your logging infrastructure.
 *
 * @example
 * ```typescript
 * const logger: MastraLogger = {
 *   error: (msg, err) => console.error(`[ERROR] ${msg}`, err),
 *   warn: (msg) => console.warn(`[WARN] ${msg}`),
 *   info: (msg) => console.info(`[INFO] ${msg}`),
 *   debug: (msg) => console.debug(`[DEBUG] ${msg}`),
 * };
 * ```
 */
export interface MastraLogger {
  /** Log error messages with optional error object */
  error: (message: string, error?: unknown) => void;
  /** Log warning messages */
  warn: (message: string) => void;
  /** Log informational messages */
  info: (message: string) => void;
  /** Log debug messages (typically disabled in production) */
  debug?: (message: string) => void;
}

// ============================================================================
// Body Limit Options
// ============================================================================

/**
 * Options for configuring request body size limits.
 * Used to prevent oversized payloads from consuming server resources.
 */
export interface BodyLimitOptions {
  /** Maximum size of the request body in bytes */
  maxSize: number;
  /**
   * Error handler called when body size limit is exceeded.
   * Return value will be sent as the response body.
   */
  onError: (error: unknown) => unknown;
}

// ============================================================================
// Stream Options
// ============================================================================

/**
 * Options for configuring stream behavior.
 */
export interface StreamOptions {
  /**
   * When true (default), redacts sensitive data from stream chunks
   * (system prompts, tool definitions, API keys) before sending to clients.
   *
   * Set to false to include full request data in stream chunks (useful for
   * debugging or internal services that need access to this data).
   *
   * @default true
   */
  redact?: boolean;
}

// ============================================================================
// Derived Context Types
// ============================================================================

/**
 * Core context variables added by ElysiaServer's context middleware.
 * These become available in all route handlers after `registerContextMiddleware()`.
 *
 * The index signature is required for compatibility with Elysia's derive function.
 */
export interface MastraDeriveContext {
  /** The Mastra instance for accessing agents, workflows, and tools */
  mastra: Mastra;
  /** Request-scoped context for passing data through the request lifecycle */
  requestContext: RequestContext;
  /** Tools available to route handlers */
  tools: ToolsInput;
  /** Signal for request cancellation - fires when client disconnects */
  abortSignal: AbortSignal;
  /** Task store for A2A (Agent-to-Agent) communication */
  taskStore?: InMemoryTaskStore;
  /** Index signature for Elysia derive compatibility */
  [key: string]: unknown;
}

/**
 * Authentication context added by ElysiaServer's auth middleware.
 * Only present when authentication is configured in Mastra.
 *
 * The index signature is required for compatibility with Elysia's derive function.
 */
export interface MastraAuthContext {
  /** Authenticated user object (shape depends on your auth implementation) */
  user: unknown;
  /** Authentication error state - null if authenticated successfully */
  authError: 'unauthorized' | null;
  /** Index signature for Elysia derive compatibility */
  [key: string]: unknown;
}

/**
 * Complete derived context after all Mastra middleware has run.
 * Combines core context with optional auth context.
 */
export type MastraFullContext = MastraDeriveContext & Partial<MastraAuthContext>;

// ============================================================================
// Elysia Type Helpers
// ============================================================================

/**
 * Type-safe Elysia context for route handlers.
 * Use this to properly type your route handler parameters.
 *
 * @example
 * ```typescript
 * app.get('/my-route', (ctx: ElysiaContext) => {
 *   // All Mastra context is properly typed
 *   const { mastra, tools, requestContext, abortSignal } = ctx;
 *   const agent = mastra.getAgent('myAgent');
 *   return { status: 'ok' };
 * });
 * ```
 */
export type ElysiaContext = Context & MastraFullContext;

/**
 * Type-safe Elysia app with Mastra context attached.
 * Use this when you need to type an Elysia instance that has the adapter's
 * context middleware applied.
 *
 * @example
 * ```typescript
 * import { ElysiaWithMastra } from 'elysia-mastra';
 *
 * function myPlugin(app: ElysiaWithMastra) {
 *   return app.get('/custom', ({ mastra, requestContext, tools }) => {
 *     // mastra, requestContext, and tools are all properly typed!
 *     const agents = Object.keys(mastra.getAgents?.() ?? {});
 *     return { agents };
 *   });
 * }
 * ```
 */
export type ElysiaWithMastra = AnyElysia;

// ============================================================================
// Server Configuration
// ============================================================================

/**
 * Configuration options for the ElysiaServer constructor.
 */
export interface ElysiaServerOptions {
  /** The Elysia app instance to attach routes to (accepts any Elysia variant) */
  app: AnyElysia;
  /** The Mastra instance providing agents, workflows, and tools */
  mastra: Mastra;
  /** Optional prefix for all registered routes (e.g., '/api') */
  prefix?: string;
  /** Optional path for the OpenAPI specification endpoint */
  openapiPath?: string;
  /** Optional body size limit configuration */
  bodyLimitOptions?: BodyLimitOptions;
  /** Optional stream redaction configuration */
  streamOptions?: StreamOptions;
  /**
   * Optional per-route authentication overrides.
   * Keys follow format `METHOD:PATH` (e.g., 'GET:/health', 'POST:/webhooks/*').
   * Set value to `false` to make a route public, `true` to require auth.
   * Supports wildcards (*) for path matching.
   *
   * @example
   * ```typescript
   * new ElysiaServer({
   *   // ...
   *   customRouteAuthConfig: new Map([
   *     ['GET:/health', false],           // Public health check
   *     ['POST:/webhooks/*', false],      // Public webhook endpoints
   *     ['ALL:/admin/*', true],           // Protected admin routes
   *   ]),
   * });
   * ```
   */
  customRouteAuthConfig?: Map<string, boolean>;
  /** Optional tools to make available to route handlers */
  tools?: ToolsInput;
  /** Optional task store for A2A (Agent-to-Agent) communication */
  taskStore?: InMemoryTaskStore;
  /**
   * Optional logger for production debugging and monitoring.
   * If not provided, errors are logged to console.error.
   */
  logger?: MastraLogger;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Parameters extracted from an HTTP request.
 * Used internally by the adapter for parameter validation.
 */
export interface ExtractedParams {
  /** URL path parameters (e.g., /users/:id -> { id: '123' }) */
  urlParams: Record<string, string>;
  /** Query string parameters */
  queryParams: Record<string, string | string[]>;
  /** Request body (parsed JSON or form data) */
  body: unknown;
}

/**
 * Internal type for MCP HTTP transport result.
 */
export interface McpHttpResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Internal type for MCP SSE transport result.
 */
export interface McpSseResult {
  stream?: ReadableStream;
  headers?: Record<string, string>;
}

/**
 * Internal type for streaming results.
 */
export interface StreamResult {
  fullStream: ReadableStream;
}

// ============================================================================
// Plugin Options
// ============================================================================

/**
 * Options for the mastra() plugin helper.
 */
export interface MastraPluginOptions {
  /** The Mastra instance */
  mastra: Mastra;
  /** Optional tools to make available */
  tools?: ToolsInput;
  /** Optional task store for A2A */
  taskStore?: InMemoryTaskStore;
}

export type { Mastra } from '@mastra/core/mastra';
export type { ToolsInput } from '@mastra/core/agent';
export type { RequestContext } from '@mastra/core/request-context';
export type { InMemoryTaskStore } from '@mastra/server/a2a/store';
export type { AnyElysia } from 'elysia';
