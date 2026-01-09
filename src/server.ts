/**
 * ElysiaServer - Mastra server adapter for Elysia framework
 */

import { Elysia, type Context } from 'elysia';
import { MastraServer, type ServerRoute } from '@mastra/server/server-adapter';
import type {
  ElysiaServerOptions,
  ExtractedParams,
} from './types';

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
 * import { ElysiaServer } from 'elysia-mastra';
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
 * app.listen(3000);
 * ```
 */
export class ElysiaServer extends MastraServer<Elysia, Context, Context> {
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
  }

  /**
   * Registers context middleware that attaches Mastra instance and
   * request context to every request using Elysia's derive.
   */
  registerContextMiddleware(): void {
    this.app.derive(({ request }) => {
      // Create AbortController for request cancellation
      const abortController = new AbortController();
      
      // Merge request context from query params and body
      // Note: Body parsing happens later in the request lifecycle,
      // so we'll handle body requestContext in route handlers
      const url = new URL(request.url);
      const paramsRequestContext = url.searchParams.get('requestContext');
      
      const requestContext = this.mergeRequestContext({
        paramsRequestContext: paramsRequestContext ? JSON.parse(paramsRequestContext) : undefined,
        bodyRequestContext: undefined, // Will be merged in route handler after body parsing
      });

      return {
        mastra: this.mastra,
        requestContext,
        tools: this.tools ?? {},
        abortSignal: abortController.signal,
        taskStore: this.taskStore,
      };
    });
  }

  /**
   * Registers authentication middleware if auth is configured.
   * Uses Elysia's onBeforeHandle for auth checks.
   * 
   * Authentication flow:
   * 1. Extract bearer token from Authorization header
   * 2. Validate token using configured authenticateToken function
   * 3. If invalid, return 401 Unauthorized
   * 4. Check authorization using configured authorize/authorizeUser function
   * 5. If not authorized, return 403 Forbidden
   * 6. Attach user to context for downstream handlers
   */
  registerAuthMiddleware(): void {
    // Get auth configuration from Mastra server config
    const authConfig = this.mastra.getServer()?.auth;
    
    // Skip registration if no auth is configured (Requirement 4.1)
    if (!authConfig) {
      return;
    }

    // Register authentication middleware using Elysia's onBeforeHandle (Requirement 4.2)
    this.app.onBeforeHandle(async ({ request, set, ...context }) => {
      // Extract bearer token from Authorization header
      const authHeader = request.headers.get('authorization');
      const token = authHeader?.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : (authHeader ?? '');

      // Validate token using configured authenticateToken function
      if (authConfig.authenticateToken) {
        // authenticateToken expects (token: string, request: HonoRequest)
        // We pass the standard Request and cast it - auth providers typically
        // only use basic request properties that are compatible
        const user = await authConfig.authenticateToken(token, request as never);
        
        // If authentication fails, return 401 Unauthorized (Requirement 4.3)
        if (!user) {
          set.status = 401;
          return { error: 'Unauthorized' };
        }

        // Attach user to context for downstream handlers (Requirement 4.5)
        // We store user in a way that can be accessed by route handlers
        (context as Record<string, unknown>).user = user;
      }
    });

    // Register authorization middleware (Requirement 4.4)
    this.app.onBeforeHandle(async ({ request, set, ...context }) => {
      const user = (context as Record<string, unknown>).user;
      
      // Check for authorize function (MastraAuthConfig interface)
      // or authorizeUser function (MastraAuthProvider interface)
      const authConfigAny = authConfig as Record<string, unknown>;
      const authorizeFunc = authConfigAny.authorize as ((
        path: string,
        method: string,
        user: unknown,
        context: unknown
      ) => Promise<boolean>) | undefined;
      const authorizeUserFunc = authConfigAny.authorizeUser as ((
        user: unknown,
        request: unknown
      ) => Promise<boolean> | boolean) | undefined;

      // Skip authorization check if no authorize function is configured
      if (!authorizeFunc && !authorizeUserFunc) {
        return;
      }

      let allowed = true;

      if (authorizeFunc) {
        // MastraAuthConfig style: authorize(path, method, user, context)
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;
        // Pass a minimal context object - the authorize function expects ContextWithMastra
        // but we provide what we have available
        allowed = await authorizeFunc(path, method, user, context);
      } else if (authorizeUserFunc) {
        // MastraAuthProvider style: authorizeUser(user, request)
        const result = authorizeUserFunc(user, request);
        allowed = result instanceof Promise ? await result : result;
      }

      // If authorization fails, return 403 Forbidden (Requirement 4.4)
      if (!allowed) {
        set.status = 403;
        return { error: 'Forbidden' };
      }
    });
  }

  /**
   * Registers a single route with the Elysia app.
   * 
   * @param app - The Elysia app instance
   * @param route - The route definition from Mastra
   * @param options - Route options including prefix
   */
  async registerRoute(
    app: Elysia,
    route: ServerRoute,
    options: { prefix?: string }
  ): Promise<void> {
    // Will be implemented in task 7
  }

  /**
   * Extracts URL params, query params, and body from an Elysia request.
   * 
   * @param route - The route definition
   * @param request - The Elysia context
   * @returns Extracted parameters object
   */
  async getParams(
    route: ServerRoute,
    request: Context
  ): Promise<ExtractedParams> {
    // Will be implemented in task 6
    return {
      urlParams: {},
      queryParams: {},
      body: undefined,
    };
  }

  /**
   * Sends a response based on the route's response type.
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
    // Will be implemented in task 9
    return result;
  }

  /**
   * Handles streaming responses for SSE and ndjson formats.
   * 
   * @param route - The route definition
   * @param response - The Elysia context
   * @param result - The streaming result
   */
  async stream(
    route: ServerRoute,
    response: Context,
    result: unknown
  ): Promise<unknown> {
    // Will be implemented in task 10
    return result;
  }
}
