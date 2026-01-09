/**
 * Property-based tests for ElysiaServer - Property 2: Context Middleware Attachment
 * 
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';
import type { ToolsInput } from '@mastra/core/agent';

/**
 * Feature: elysia-mastra-adapter, Property 2: Context Middleware Attachment
 * 
 * For any request processed after `registerContextMiddleware()` is called,
 * the request context SHALL contain: mastra instance, RequestContext map,
 * tools record, and AbortSignal.
 */
describe('Property 2: Context Middleware Attachment', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const toolNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/);

  const toolsRecordArb = fc
    .array(toolNameArb, { minLength: 0, maxLength: 5 })
    .map((names) => {
      const tools: Record<string, { execute: () => Promise<unknown> }> = {};
      for (const name of names) {
        tools[name] = { execute: async () => ({ result: name }) };
      }
      return tools as ToolsInput;
    });

  const requestContextArb = fc
    .array(
      fc.tuple(
        fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/),
        fc.oneof(fc.string(), fc.integer())
      ),
      { minLength: 0, maxLength: 3 }
    )
    .map((pairs) => Object.fromEntries(pairs));

  test('context middleware attaches mastra instance to all requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        toolsRecordArb,
        async (tools) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          // Use proper type assertion for test mock tools
          const server = new ElysiaServer({ 
            app, 
            mastra, 
            tools,
          });
          server.registerContextMiddleware();

          let attachedMastra: unknown = undefined;

          app.get('/test', (context) => {
            const ctx = context as unknown as { mastra: unknown };
            attachedMastra = ctx.mastra;
            return { ok: true };
          });

          const response = await app.handle(new Request('http://localhost/test'));

          expect(response.status).toBe(200);
          expect(attachedMastra).toBe(mastra);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('context middleware attaches RequestContext map to all requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        requestContextArb,
        async (paramsContext) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });
          server.registerContextMiddleware();

          let attachedRequestContext: unknown = undefined;

          app.get('/test', (context) => {
            const ctx = context as unknown as { requestContext: unknown };
            attachedRequestContext = ctx.requestContext;
            return { ok: true };
          });

          const url = new URL('http://localhost/test');
          if (Object.keys(paramsContext).length > 0) {
            url.searchParams.set('requestContext', JSON.stringify(paramsContext));
          }

          const response = await app.handle(new Request(url.toString()));

          expect(response.status).toBe(200);
          expect(attachedRequestContext).toBeDefined();
          expect(typeof attachedRequestContext).toBe('object');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('context middleware attaches tools record to all requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        toolsRecordArb,
        async (tools) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          // Use proper type assertion for test mock tools
          const server = new ElysiaServer({ 
            app, 
            mastra, 
            tools,
          });
          server.registerContextMiddleware();

          let attachedTools: unknown = undefined;

          app.get('/test', (context) => {
            const ctx = context as unknown as { tools: unknown };
            attachedTools = ctx.tools;
            return { ok: true };
          });

          const response = await app.handle(new Request('http://localhost/test'));

          expect(response.status).toBe(200);
          expect(attachedTools).toBeDefined();
          expect(typeof attachedTools).toBe('object');
          expect(attachedTools).toEqual(tools);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('context middleware attaches AbortSignal to all requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });
          server.registerContextMiddleware();

          let attachedAbortSignal: unknown = undefined;

          app.get('/test', (context) => {
            const ctx = context as unknown as { abortSignal: unknown };
            attachedAbortSignal = ctx.abortSignal;
            return { ok: true };
          });

          const response = await app.handle(new Request('http://localhost/test'));

          expect(response.status).toBe(200);
          expect(attachedAbortSignal).toBeDefined();
          expect(attachedAbortSignal).toBeInstanceOf(AbortSignal);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('all context properties are attached together for any request', async () => {
    await fc.assert(
      fc.asyncProperty(
        toolsRecordArb,
        requestContextArb,
        async (tools, paramsContext) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          // Use proper type assertion for test mock tools
          const server = new ElysiaServer({ 
            app, 
            mastra, 
            tools,
          });
          server.registerContextMiddleware();

          let capturedContext: {
            mastra: unknown;
            requestContext: unknown;
            tools: unknown;
            abortSignal: unknown;
          } | undefined = undefined;

          app.get('/test', (context) => {
            const ctx = context as unknown as {
              mastra: unknown;
              requestContext: unknown;
              tools: unknown;
              abortSignal: unknown;
            };
            capturedContext = {
              mastra: ctx.mastra,
              requestContext: ctx.requestContext,
              tools: ctx.tools,
              abortSignal: ctx.abortSignal,
            };
            return { ok: true };
          });

          const url = new URL('http://localhost/test');
          if (Object.keys(paramsContext).length > 0) {
            url.searchParams.set('requestContext', JSON.stringify(paramsContext));
          }

          const response = await app.handle(new Request(url.toString()));

          expect(response.status).toBe(200);
          expect(capturedContext).toBeDefined();
          expect(capturedContext!.mastra).toBe(mastra);
          expect(capturedContext!.requestContext).toBeDefined();
          expect(typeof capturedContext!.requestContext).toBe('object');
          expect(capturedContext!.tools).toEqual(tools);
          expect(capturedContext!.abortSignal).toBeInstanceOf(AbortSignal);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
