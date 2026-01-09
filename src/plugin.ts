import { Elysia } from 'elysia';
import { RequestContext } from '@mastra/core/request-context';
import type { MastraPluginOptions, MastraDeriveContext } from './types';

/**
 * Creates an Elysia plugin that adds Mastra context to all routes.
 *
 * This is the recommended way to use Mastra with Elysia when you want
 * automatic type inference without manually typing each handler.
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { Mastra } from '@mastra/core';
 * import { mastra } from 'elysia-mastra';
 *
 * const mastraInstance = new Mastra({});
 *
 * const app = new Elysia()
 *   .use(mastra({ mastra: mastraInstance }))
 *   .get('/info', ({ mastra, tools, requestContext }) => {
 *     // All properties are automatically typed!
 *     return { status: 'ok' };
 *   })
 *   .listen(3000);
 * ```
 */
export function mastra(options: MastraPluginOptions) {
  const { mastra: mastraInstance, tools = {}, taskStore } = options;

  return new Elysia({ name: 'mastra' })
    .derive({ as: 'global' }, ({ request }): MastraDeriveContext => {
      // Create AbortController and connect to request lifecycle
      const abortController = new AbortController();

      if ('signal' in request && request.signal instanceof AbortSignal) {
        if (request.signal.aborted) {
          abortController.abort(request.signal.reason);
        } else {
          request.signal.addEventListener(
            'abort',
            () => {
              abortController.abort(request.signal.reason);
            },
            { once: true }
          );
        }
      }

      let paramsRequestContext: Record<string, unknown> | undefined;
      try {
        const url = new URL(request.url);
        const rcParam = url.searchParams.get('requestContext');
        if (rcParam) {
          paramsRequestContext = JSON.parse(rcParam);
        }
      } catch {
        // Invalid JSON - ignore
      }

      const requestContext = new RequestContext();
      if (paramsRequestContext) {
        for (const [key, value] of Object.entries(paramsRequestContext)) {
          requestContext.set(key, value);
        }
      }

      return {
        mastra: mastraInstance,
        requestContext,
        tools,
        abortSignal: abortController.signal,
        taskStore,
      };
    });
}

/**
 * Alias for mastra() plugin.
 * Use whichever naming convention you prefer.
 *
 * @example
 * ```typescript
 * import { Elysia } from 'elysia';
 * import { withMastra } from 'elysia-mastra';
 *
 * const app = new Elysia()
 *   .use(withMastra({ mastra: myMastra }))
 *   .get('/info', ({ mastra }) => ({ status: 'ok' }));
 * ```
 */
export const withMastra = mastra;
