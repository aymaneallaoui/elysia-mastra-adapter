import { type Context, type AnyElysia } from 'elysia';
import { MastraServer, type ServerRoute, redactStreamChunk } from '@mastra/server/server-adapter';
import type {
  ElysiaServerOptions,
  ExtractedParams,
  MastraDeriveContext,
  MastraAuthContext,
  MastraLogger,
  McpHttpResult,
  McpSseResult,
  StreamResult,
  BodyLimitOptions,
} from './types';

const defaultLogger: MastraLogger = {
  error: (message: string, error?: unknown) => {
    console.error(`[ElysiaServer] ${message}`, error ?? '');
  },
  warn: (message: string) => {
    console.warn(`[ElysiaServer] ${message}`);
  },
  info: (message: string) => {
    console.info(`[ElysiaServer] ${message}`);
  },
  debug: (message: string) => {
    console.debug(`[ElysiaServer] ${message}`);
  },
};

/**
 * Elysia server adapter for Mastra.
 *
 * Extends MastraServer to provide Elysia-specific implementations for
 * route registration, middleware, and response handling.
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { Mastra } from '@mastra/core';
 * import { ElysiaServer, type ElysiaContext } from 'elysia-mastra';
 *
 * const app = new Elysia();
 * const mastra = new Mastra({ ... });
 *
 * const server = new ElysiaServer({
 *   app,
 *   mastra,
 *   prefix: '/api',
 * });
 *
 * // Initialize all middleware and routes
 * await server.init();
 *
 * // Add custom routes with proper typing
 * app.get('/custom', (ctx: ElysiaContext) => {
 *   const { mastra, tools } = ctx;
 *   return { status: 'ok' };
 * });
 *
 * app.listen(3000);
 * ```
 */
export class ElysiaServer extends MastraServer<AnyElysia, Context, Context> {
  /** Logger instance for debugging and monitoring */
  private readonly log: MastraLogger;

  /** Body limit configuration */
  private readonly bodyLimit?: BodyLimitOptions;

  /** Per-route auth configuration */
  private readonly routeAuthConfig?: Map<string, boolean>;

  constructor(options: ElysiaServerOptions) {
    super({
      app: options.app,
      mastra: options.mastra,
      prefix: options.prefix,
      openapiPath: options.openapiPath,
      bodyLimitOptions: options.bodyLimitOptions,
      streamOptions: options.streamOptions ?? { redact: true },
      customRouteAuthConfig: options.customRouteAuthConfig,
      tools: options.tools,
      taskStore: options.taskStore,
    });

    this.log = options.logger ?? defaultLogger;
    this.bodyLimit = options.bodyLimitOptions;
    this.routeAuthConfig = options.customRouteAuthConfig;
  }

  /**
   * Initializes the server by registering all middleware and routes.
   * This is the recommended way to set up the server.
   *
   * Order of initialization:
   * 1. Body limit middleware (if configured)
   * 2. Context middleware (mastra, tools, requestContext, abortSignal)
   * 3. Auth middleware (if auth is configured in Mastra)
   * 4. All Mastra routes
   *
   * @example
   * ```typescript
   * const server = new ElysiaServer({ app, mastra });
   * await server.init();
   * // Server is now ready to handle requests
   * ```
   */
  override async init(): Promise<void> {
    // Register body limit middleware first
    this.registerBodyLimitMiddleware();

    // Then register context and auth middleware
    this.registerContextMiddleware();
    this.registerAuthMiddleware();

    // Finally register all routes
    await this.registerRoutes();

    this.log.info?.('Server initialized successfully');
  }

  /**
   * Registers body size limit middleware.
   * Rejects requests that exceed the configured maxSize with a 413 status.
   */
  registerBodyLimitMiddleware(): void {
    if (!this.bodyLimit) {
      return;
    }

    const { maxSize, onError } = this.bodyLimit;

    this.app.onBeforeHandle(async ({ request, set }) => {
      const contentLength = request.headers.get('content-length');

      if (contentLength) {
        const size = parseInt(contentLength, 10);

        if (!Number.isNaN(size) && size > maxSize) {
          this.log.warn?.(
            `Request body size ${size} exceeds limit ${maxSize}`
          );
          set.status = 413;
          return onError(new Error(`Request body size ${size} exceeds maximum allowed size of ${maxSize} bytes`));
        }
      }
    });

    this.log.debug?.(`Body limit middleware registered with maxSize: ${maxSize}`);
  }

  /**
   * Registers context middleware that attaches Mastra instance and
   * request context to every request using Elysia's derive.
   *
   * This middleware adds the following to every request context:
   * - mastra: The Mastra instance
   * - requestContext: Request-scoped context map (merged from query params and body)
   * - tools: Available tools
   * - abortSignal: Signal that fires when client disconnects
   * - taskStore: Task store for A2A communication (if configured)
   */
  registerContextMiddleware(): void {
    this.app.derive(({ request }): MastraDeriveContext => {
      // Create AbortController and connect to request lifecycle
      const abortController = new AbortController();

      // This ensures the signal fires when the client disconnects
      if ('signal' in request && request.signal instanceof AbortSignal) {
        if (request.signal.aborted) {
          // Request was already aborted
          abortController.abort(request.signal.reason);
        } else {
          request.signal.addEventListener('abort', () => {
            abortController.abort(request.signal.reason);
          }, { once: true });
        }
      }

      let paramsRequestContext: Record<string, unknown> | undefined;
      try {
        const url = new URL(request.url);
        const rcParam = url.searchParams.get('requestContext');
        if (rcParam) {
          paramsRequestContext = JSON.parse(rcParam);
        }
      } catch (error) {
        // Invalid JSON in requestContext param - log and continue without it
        this.log.warn?.(`Invalid JSON in requestContext query param: ${error}`);
      }

      const requestContext = this.mergeRequestContext({
        paramsRequestContext,
        bodyRequestContext: undefined,
      });

      return {
        mastra: this.mastra,
        requestContext,
        tools: this.tools ?? {},
        abortSignal: abortController.signal,
        taskStore: this.taskStore,
      };
    });

    this.log.debug?.('Context middleware registered');
  }

  /**
   * Registers authentication middleware if auth is configured.
   * Uses Elysia's derive for attaching user to context and onBeforeHandle for auth checks.
   *
   * Authentication flow:
   * 1. Check per-route auth overrides (customRouteAuthConfig)
   * 2. Extract bearer token from Authorization header
   * 3. Validate token using configured authenticateToken function
   * 4. If invalid, return 401 Unauthorized
   * 5. Check authorization using configured authorize/authorizeUser function
   * 6. If not authorized, return 403 Forbidden
   * 7. Attach user to context for downstream handlers via derive
   */
  registerAuthMiddleware(): void {
    const authConfig = this.mastra.getServer()?.auth;

    if (!authConfig) {
      this.log.debug?.('No auth config found, skipping auth middleware');
      return;
    }

    this.app.derive(async ({ request, set }): Promise<MastraAuthContext> => {
      const authOverride = this.checkRouteAuthOverride(request);
      if (authOverride === false) {
        return { user: null, authError: null };
      }

      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : (authHeader ?? '');

      if (authConfig.authenticateToken) {
        try {
          const user = await authConfig.authenticateToken(token, request as never);

          // If authentication fails, return 401 Unauthorized
          if (!user) {
            set.status = 401;
            return { user: null, authError: 'unauthorized' };
          }

          return { user, authError: null };
        } catch (error) {
          this.log.error?.('Authentication error', error);
          set.status = 401;
          return { user: null, authError: 'unauthorized' };
        }
      }

      return { user: null, authError: null };
    });

    this.app.onBeforeHandle(({ set, ...context }) => {
      const ctx = context as unknown as MastraAuthContext;

      // If authentication failed in derive, return 401
      if (ctx.authError === 'unauthorized') {
        set.status = 401;
        return { error: 'Unauthorized' };
      }
    });

    this.app.onBeforeHandle(async ({ request, set, ...context }) => {
      const ctx = context as unknown as MastraAuthContext;

      // Skip if already failed authentication
      if (ctx.authError === 'unauthorized') {
        return;
      }

      const user = ctx.user;

      const authorizeFunc = this.getAuthorizeFunction(authConfig);
      const authorizeUserFunc = this.getAuthorizeUserFunction(authConfig);

      if (!authorizeFunc && !authorizeUserFunc) {
        return;
      }

      let allowed = true;

      try {
        if (authorizeFunc) {
          const url = new URL(request.url);
          const path = url.pathname;
          const method = request.method;
          allowed = await authorizeFunc(path, method, user, context);
        } else if (authorizeUserFunc) {
          const result = authorizeUserFunc(user, request);
          allowed = result instanceof Promise ? await result : result;
        }
      } catch (error) {
        this.log.error?.('Authorization error', error);
        allowed = false;
      }

      if (!allowed) {
        set.status = 403;
        return { error: 'Forbidden' };
      }
    });

    this.log.debug?.('Auth middleware registered');
  }

  /**
   * Checks if a route has an auth override in customRouteAuthConfig.
   * Returns true to require auth, false to skip auth, undefined for default behavior.
   */
  private checkRouteAuthOverride(request: Request): boolean | undefined {
    if (!this.routeAuthConfig || this.routeAuthConfig.size === 0) {
      return undefined;
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // Check in order of specificity:
    // 1. Exact match: METHOD:PATH
    const exactKey = `${method}:${path}`;
    if (this.routeAuthConfig.has(exactKey)) {
      return this.routeAuthConfig.get(exactKey);
    }

    // 2. Wildcard match: METHOD:PATH/*
    const pathParts = path.split('/').filter(Boolean);
    for (let i = pathParts.length; i > 0; i--) {
      const wildcardPath = '/' + pathParts.slice(0, i).join('/') + '/*';
      const wildcardKey = `${method}:${wildcardPath}`;
      if (this.routeAuthConfig.has(wildcardKey)) {
        return this.routeAuthConfig.get(wildcardKey);
      }
    }

    // 3. ALL method match
    const allExactKey = `ALL:${path}`;
    if (this.routeAuthConfig.has(allExactKey)) {
      return this.routeAuthConfig.get(allExactKey);
    }

    // 4. ALL method with wildcard
    for (let i = pathParts.length; i > 0; i--) {
      const wildcardPath = '/' + pathParts.slice(0, i).join('/') + '/*';
      const allWildcardKey = `ALL:${wildcardPath}`;
      if (this.routeAuthConfig.has(allWildcardKey)) {
        return this.routeAuthConfig.get(allWildcardKey);
      }
    }

    return undefined;
  }

  /**
   * Type-safe extraction of authorize function from auth config.
   */
  private getAuthorizeFunction(authConfig: unknown): ((
    path: string,
    method: string,
    user: unknown,
    context: unknown
  ) => Promise<boolean> | boolean) | undefined {
    if (
      authConfig &&
      typeof authConfig === 'object' &&
      'authorize' in authConfig &&
      typeof (authConfig as Record<string, unknown>).authorize === 'function'
    ) {
      return (authConfig as Record<string, unknown>).authorize as (
        path: string,
        method: string,
        user: unknown,
        context: unknown
      ) => Promise<boolean> | boolean;
    }
    return undefined;
  }

  /**
   * Type-safe extraction of authorizeUser function from auth config.
   */
  private getAuthorizeUserFunction(authConfig: unknown): ((
    user: unknown,
    request: unknown
  ) => Promise<boolean> | boolean) | undefined {
    if (
      authConfig &&
      typeof authConfig === 'object' &&
      'authorizeUser' in authConfig &&
      typeof (authConfig as Record<string, unknown>).authorizeUser === 'function'
    ) {
      return (authConfig as Record<string, unknown>).authorizeUser as (
        user: unknown,
        request: unknown
      ) => Promise<boolean> | boolean;
    }
    return undefined;
  }

  /**
   * Registers a single route with the Elysia app.
   *
   * Handles:
   * - Building full path with prefix
   * - Registering route with correct HTTP method
   * - Parameter extraction and validation
   * - Handler execution and response sending
   * - Validation error handling with 400 status
   *
   * @param app - The Elysia app instance
   * @param route - The route definition from Mastra
   * @param options - Route options including prefix
   */
  async registerRoute(
    app: AnyElysia,
    route: ServerRoute,
    options: { prefix?: string }
  ): Promise<void> {
    const fullPath = `${options.prefix || ''}${route.path}`;
    const method = route.method.toLowerCase();

    const handler = async (context: Context) => {
      try {
        // 1. Extract parameters from request
        const params = await this.getParams(route, context);

        // 2. Validate parameters with Zod schemas
        const pathParams = await this.parsePathParams(route, params.urlParams);
        const queryParams = await this.parseQueryParams(route, params.queryParams as Record<string, string>);
        const body = await this.parseBody(route, params.body);

        // 3. Get context values from derive middleware
        const derivedContext = context as unknown as MastraDeriveContext & Partial<MastraAuthContext>;

        // 4. Merge body requestContext if present
        let requestContext = derivedContext.requestContext;
        if (body && typeof body === 'object' && 'requestContext' in body) {
          const bodyWithContext = body as { requestContext?: Record<string, unknown> };
          requestContext = this.mergeRequestContext({
            paramsRequestContext: requestContext as unknown as Record<string, unknown> | undefined,
            bodyRequestContext: bodyWithContext.requestContext,
          });
        }

        // 5. Build handler params object
        const handlerParams = {
          ...pathParams,
          ...queryParams,
          ...(typeof body === 'object' && body !== null ? body : {}),
          mastra: derivedContext.mastra,
          requestContext,
          tools: derivedContext.tools ?? {},
          abortSignal: derivedContext.abortSignal,
          taskStore: derivedContext.taskStore,
          user: derivedContext.user,
        };

        // 6. Call route handler
        const result = await route.handler(handlerParams as Parameters<typeof route.handler>[0]);

        // 7. Send response based on route's response type
        return this.sendResponse(route, context, result);
      } catch (error) {
        return this.handleRouteError(error, route, fullPath, context);
      }
    };

    type AnyHandler = (ctx: Record<string, unknown>) => unknown;
    const anyHandler = handler as unknown as AnyHandler;

    switch (method) {
      case 'get':
        app.get(fullPath, anyHandler);
        break;
      case 'post':
        app.post(fullPath, anyHandler);
        break;
      case 'put':
        app.put(fullPath, anyHandler);
        break;
      case 'delete':
        app.delete(fullPath, anyHandler);
        break;
      case 'patch':
        app.patch(fullPath, anyHandler);
        break;
      case 'options':
        app.options(fullPath, anyHandler);
        break;
      default:
        app.route(route.method.toUpperCase(), fullPath, anyHandler);
    }

    this.log.debug?.(`Registered route: ${route.method} ${fullPath}`);
  }

  /**
   * Handles errors that occur during route handler execution.
   * Provides consistent error responses based on error type.
   */
  private handleRouteError(
    error: unknown,
    route: ServerRoute,
    fullPath: string,
    context: Context
  ): unknown {
    const err = error as {
      status?: number;
      details?: { status?: number };
      message?: string;
      name?: string;
      issues?: unknown[];
      errors?: unknown[];
    };

    this.log.error(`Error in route ${route.method} ${fullPath}`, error);

    const isValidationError =
      err.name === 'ZodError' ||
      err.status === 400 ||
      err.details?.status === 400 ||
      (err.message && err.message.toLowerCase().includes('validation'));

    const status = err.status ?? err.details?.status ?? (isValidationError ? 400 : 500);

    context.set.status = status;

    if (status === 400 || isValidationError) {
      return {
        error: 'VALIDATION_ERROR',
        message: err.message || 'Validation failed',
        details: err.issues ?? err.errors ?? undefined,
      };
    }

    if (status >= 500) {
      return {
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      };
    }

    return {
      error: 'ERROR',
      message: err.message || 'An error occurred',
    };
  }

  /**
   * Extracts URL params, query params, and body from an Elysia request.
   *
   * @param _route - The route definition (unused, kept for interface compatibility)
   * @param request - The Elysia context containing params, query, and body
   * @returns Extracted parameters object with urlParams, queryParams, and body
   */
  async getParams(
    _route: ServerRoute,
    request: Context
  ): Promise<ExtractedParams> {
    interface ElysiaRequestContext {
      params?: Record<string, string>;
      query?: Record<string, string | string[]>;
      body?: unknown;
    }

    const ctx = request as unknown as ElysiaRequestContext;

    const urlParams: Record<string, string> = {};
    if (ctx.params && typeof ctx.params === 'object') {
      for (const [key, value] of Object.entries(ctx.params)) {
        if (typeof value === 'string') {
          urlParams[key] = value;
        }
      }
    }

    // Extract query parameters
    const queryParams: Record<string, string | string[]> = {};
    if (ctx.query && typeof ctx.query === 'object') {
      for (const [key, value] of Object.entries(ctx.query)) {
        if (value !== undefined && value !== null) {
          queryParams[key] = value;
        }
      }
    }

    const body = ctx.body;

    return {
      urlParams,
      queryParams,
      body,
    };
  }

  /**
   * Registers the OpenAPI specification endpoint.
   *
   * The OpenAPI spec is generated from Zod schemas defined on routes
   * and includes all Mastra routes as well as any custom routes.
   *
   * @param app - The Elysia app instance
   * @param config - OpenAPI configuration options
   * @param options - Route options including prefix
   */
  override async registerOpenAPIRoute(
    app: AnyElysia,
    config: {
      title?: string;
      version?: string;
      description?: string;
      path?: string;
    } = {},
    options: { prefix?: string }
  ): Promise<void> {
    await super.registerOpenAPIRoute(app, config, options);
    this.log.debug?.(`OpenAPI route registered at ${options.prefix ?? ''}${config.path ?? '/openapi.json'}`);
  }

  /**
   * Sends a response based on the route's response type.
   *
   * Handles different response types:
   * - json: Returns JSON response (Elysia auto-serializes)
   * - stream: Delegates to stream() method for SSE/ndjson streaming
   * - datastream-response: AI SDK Response passthrough
   * - mcp-http: MCP HTTP transport response
   * - mcp-sse: MCP SSE transport response
   *
   * @param route - The route definition
   * @param response - The Elysia context
   * @param result - The result from the route handler
   */
  async sendResponse(
    route: ServerRoute,
    response: Context,
    result: unknown
  ): Promise<unknown> {
    const responseType = route.responseType as string;

    switch (responseType) {
      case 'stream':
        return this.stream(route, response, result);

      case 'json':
        return result;

      case 'datastream-response':
        if (result instanceof Response) {
          return result;
        }
        if (result && typeof result === 'object' && 'toResponse' in result) {
          const toResponse = (result as { toResponse: () => Response }).toResponse;
          if (typeof toResponse === 'function') {
            return toResponse.call(result);
          }
        }
        return result;

      case 'mcp-http':
        return this.handleMcpHttp(response, result);

      case 'mcp-sse':
        return this.handleMcpSse(route, response, result);

      default:
        return result;
    }
  }

  /**
   * Handles MCP HTTP transport responses.
   * Sets status, headers, and returns the body.
   */
  private handleMcpHttp(response: Context, result: unknown): unknown {
    const mcpResult = result as McpHttpResult;

    if (mcpResult.status) {
      response.set.status = mcpResult.status;
    }

    if (mcpResult.headers) {
      for (const [key, value] of Object.entries(mcpResult.headers)) {
        response.set.headers[key] = value;
      }
    }

    return mcpResult.body ?? result;
  }

  /**
   * Handles MCP SSE transport responses.
   * Uses the stream method with SSE format for MCP messages.
   */
  private async handleMcpSse(
    route: ServerRoute,
    response: Context,
    result: unknown
  ): Promise<unknown> {
    const mcpResult = result as McpSseResult;

    if (mcpResult.headers) {
      for (const [key, value] of Object.entries(mcpResult.headers)) {
        response.set.headers[key] = value;
      }
    }

    // If the result has a stream, use it
    if (mcpResult.stream) {
      return this.stream(
        { ...route, streamFormat: 'sse' },
        response,
        { fullStream: mcpResult.stream }
      );
    }

    return this.stream(
      { ...route, streamFormat: 'sse' },
      response,
      result
    );
  }

  /**
   * Handles streaming responses for SSE and ndjson formats.
   *
   * Sets appropriate headers based on stream format, reads chunks from the
   * result's fullStream, applies redaction if configured, and formats output
   * according to the stream format (SSE or ndjson).
   *
   * @param route - The route definition containing streamFormat
   * @param _response - The Elysia context (unused, we return a Response directly)
   * @param result - The streaming result with fullStream property
   * @returns A Response object with the streaming body
   */
  async stream(
    route: ServerRoute,
    _response: Context,
    result: unknown
  ): Promise<unknown> {
    const isSSE = route.streamFormat === 'sse';

    const streamResult = result as StreamResult;

    if (!streamResult?.fullStream) {
      this.log.error('Stream result missing fullStream property', result);
      throw new Error('Stream result must have a fullStream property');
    }

    const reader = streamResult.fullStream.getReader();

    const shouldRedact = this.streamOptions?.redact ?? true;
    const logger = this.log;

    // Create a ReadableStream that processes and formats chunks
    const outputStream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();

          if (done) {
            if (isSSE) {
              controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            }
            controller.close();
            return;
          }

          // Apply redaction if enabled
          const processedChunk = shouldRedact
            ? redactStreamChunk(value)
            : value;

          // Format based on stream format
          let formattedChunk: string;
          if (isSSE) {
            // SSE format: data: {json}\n\n
            formattedChunk = `data: ${JSON.stringify(processedChunk)}\n\n`;
          } else {
            // ndjson format: {json} followed by record separator (0x1E)
            formattedChunk = JSON.stringify(processedChunk) + '\x1E';
          }

          controller.enqueue(new TextEncoder().encode(formattedChunk));
        } catch (error) {
          logger.error('Stream error', error);
          await reader.cancel();
          controller.error(error);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': isSSE ? 'text/event-stream' : 'text/plain',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    };

    if (isSSE) {
      headers['X-Accel-Buffering'] = 'no';
    }

    return new Response(outputStream, {
      status: 200,
      headers,
    });
  }

  /**
   * Returns the Elysia app instance.
   * Useful for adding custom routes or middleware after initialization.
   */
  override getApp<T = AnyElysia>(): T {
    return this.app as T;
  }
}
