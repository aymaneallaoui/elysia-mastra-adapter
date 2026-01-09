/**
 * Property-based tests for ElysiaServer - Property 5: Parameter Extraction
 * 
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';

/**
 * Feature: elysia-mastra-adapter, Property 5: Parameter Extraction
 * 
 * For any request with path parameters, query parameters, and/or body,
 * `getParams()` SHALL return an object containing all three extracted correctly.
 */
describe('Property 5: Parameter Extraction', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const paramNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/);
  const paramValueArb = fc.stringMatching(/^[a-zA-Z0-9_-]{1,20}$/);

  const urlParamsArb = fc
    .array(fc.tuple(paramNameArb, paramValueArb), { minLength: 0, maxLength: 3 })
    .map((pairs) => {
      const seen = new Set<string>();
      return pairs.filter(([key]) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .map((pairs) => Object.fromEntries(pairs));

  const queryParamsArb = fc
    .array(fc.tuple(paramNameArb, paramValueArb), { minLength: 0, maxLength: 5 })
    .map((pairs) => {
      const seen = new Set<string>();
      return pairs.filter(([key]) => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .map((pairs) => Object.fromEntries(pairs));

  const bodyArb = fc.oneof(
    fc.constant(undefined),
    fc.record({
      name: fc.string({ minLength: 1, maxLength: 20 }),
      value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
    })
  );

  test('getParams extracts URL path parameters correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        urlParamsArb,
        async (expectedUrlParams) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          const paramNames = Object.keys(expectedUrlParams);
          const pathPattern = paramNames.length > 0
            ? '/test/' + paramNames.map((name) => `:${name}`).join('/')
            : '/test';
          const actualPath = paramNames.length > 0
            ? '/test/' + paramNames.map((name) => expectedUrlParams[name]).join('/')
            : '/test';

          let extractedParams: { urlParams: Record<string, string> } | undefined;

          app.get(pathPattern, async (context) => {
            const route = { path: pathPattern, method: 'GET' as const } as Parameters<typeof server.getParams>[0];
            const params = await server.getParams(route, context);
            extractedParams = params;
            return { ok: true };
          });

          const response = await app.handle(new Request(`http://localhost${actualPath}`));

          expect(response.status).toBe(200);
          expect(extractedParams).toBeDefined();
          expect(extractedParams!.urlParams).toEqual(expectedUrlParams);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('getParams extracts query parameters correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        queryParamsArb,
        async (expectedQueryParams) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          let extractedParams: { queryParams: Record<string, string | string[]> } | undefined;

          app.get('/test', async (context) => {
            const route = { path: '/test', method: 'GET' as const } as Parameters<typeof server.getParams>[0];
            const params = await server.getParams(route, context);
            extractedParams = params;
            return { ok: true };
          });

          const url = new URL('http://localhost/test');
          for (const [key, value] of Object.entries(expectedQueryParams)) {
            url.searchParams.set(key, value as string);
          }

          const response = await app.handle(new Request(url.toString()));

          expect(response.status).toBe(200);
          expect(extractedParams).toBeDefined();
          
          for (const [key, expectedValue] of Object.entries(expectedQueryParams)) {
            const actualValue = extractedParams!.queryParams[key];
            expect(actualValue).toBe(expectedValue);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('getParams extracts request body correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        bodyArb,
        async (expectedBody) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          let extractedParams: { body: unknown } | undefined;

          app.post('/test', async (context) => {
            const route = { path: '/test', method: 'POST' as const } as Parameters<typeof server.getParams>[0];
            const params = await server.getParams(route, context);
            extractedParams = params;
            return { ok: true };
          });

          const requestInit: RequestInit = { method: 'POST' };

          if (expectedBody !== undefined) {
            requestInit.headers = { 'Content-Type': 'application/json' };
            requestInit.body = JSON.stringify(expectedBody);
          }

          const response = await app.handle(new Request('http://localhost/test', requestInit));

          expect(response.status).toBe(200);
          expect(extractedParams).toBeDefined();
          
          if (expectedBody !== undefined) {
            expect(extractedParams!.body).toEqual(expectedBody);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('getParams returns empty objects when no parameters are provided', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          let extractedParams: {
            urlParams: Record<string, string>;
            queryParams: Record<string, string | string[]>;
            body: unknown;
          } | undefined;

          app.get('/test', async (context) => {
            const route = { path: '/test', method: 'GET' as const } as Parameters<typeof server.getParams>[0];
            const params = await server.getParams(route, context);
            extractedParams = params;
            return { ok: true };
          });

          const response = await app.handle(new Request('http://localhost/test'));

          expect(response.status).toBe(200);
          expect(extractedParams).toBeDefined();
          expect(extractedParams!.urlParams).toEqual({});
          expect(extractedParams!.queryParams).toEqual({});

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
