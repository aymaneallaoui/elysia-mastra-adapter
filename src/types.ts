/**
 * Type definitions for the Elysia-Mastra adapter
 */

import type { Elysia, AnyElysia } from 'elysia';
import type { Mastra } from '@mastra/core/mastra';
import type { ToolsInput } from '@mastra/core/agent';
import type { RequestContext } from '@mastra/core/request-context';
import type { InMemoryTaskStore } from '@mastra/server/a2a/store';

/**
 * Options for configuring request body size limits.
 */
export interface BodyLimitOptions {
  /** Maximum size of the request body in bytes */
  maxSize: number;
  /** Error handler called when body size limit is exceeded */
  onError: (error: unknown) => unknown;
}

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

/**
 * Configuration options for the ElysiaServer constructor.
 */
export interface ElysiaServerOptions {
  /** The Elysia app instance to attach routes to */
  app: Elysia;
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
  /** Optional per-route authentication overrides */
  customRouteAuthConfig?: Map<string, boolean>;
  /** Optional tools to make available to route handlers */
  tools?: ToolsInput;
  /** Optional task store for A2A (Agent-to-Agent) communication */
  taskStore?: InMemoryTaskStore;
}

/**
 * Variables attached to Elysia's derive context by the adapter.
 * These are available in all route handlers after context middleware runs.
 */
export interface ElysiaVariables {
  /** The Mastra instance */
  mastra: Mastra;
  /** Request-scoped context for passing data through the request lifecycle */
  requestContext: RequestContext;
  /** Tools available to route handlers */
  tools: ToolsInput;
  /** Signal for request cancellation */
  abortSignal: AbortSignal;
  /** Authenticated user (set by auth middleware if configured) */
  user?: unknown;
  /** Task store for A2A communication */
  taskStore?: InMemoryTaskStore;
}

/**
 * Type helper for Elysia apps with Mastra context attached.
 * Use this when you need to type an Elysia instance that has the adapter's
 * context middleware applied.
 *
 * @example
 * ```typescript
 * import { ElysiaWithMastra } from 'elysia-mastra';
 *
 * function myPlugin(app: ElysiaWithMastra) {
 *   return app.get('/custom', ({ mastra, requestContext }) => {
 *     // mastra and requestContext are typed
 *   });
 * }
 * ```
 */
export type ElysiaWithMastra = AnyElysia;

/**
 * Parameters extracted from an HTTP request.
 */
export interface ExtractedParams {
  /** URL path parameters (e.g., /users/:id -> { id: '123' }) */
  urlParams: Record<string, string>;
  /** Query string parameters */
  queryParams: Record<string, string | string[]>;
  /** Request body (parsed JSON or form data) */
  body: unknown;
}
