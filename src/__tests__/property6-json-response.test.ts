/**
 * Property-based tests for ElysiaServer - Property 6: JSON Response Handling
 *
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';

/**
 * Feature: elysia-mastra-adapter, Property 6: JSON Response Handling
 *
 * For any route with `responseType: 'json'`, `sendResponse()` SHALL return
 * the result as a JSON response with appropriate Content-Type header.
 */
describe('Property 6: JSON Response Handling', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  // Avoid -0 which doesn't round-trip through JSON correctly (JSON.stringify(-0) === "0")
  const jsonPrimitiveArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }),
    fc.integer(),
    fc.double({ noNaN: true, noDefaultInfinity: true }).map((n) => (Object.is(n, -0) ? 0 : n)),
    fc.boolean()
  );

  const jsonObjectArb = fc.dictionary(
    fc.stringMatching(/^[a-z][a-z0-9_]{0,9}$/),
    jsonPrimitiveArb,
    { minKeys: 1, maxKeys: 5 }
  );

  const jsonArrayArb = fc.array(
    fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      value: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { minLength: 1, maxLength: 5 }
  );

  const pathArb = fc
    .array(fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/), { minLength: 1, maxLength: 3 })
    .map((segments) => '/' + segments.join('/'));

  test('returns JSON-parseable response for object results', async () => {
    await fc.assert(
      fc.asyncProperty(jsonObjectArb, pathArb, async (expectedResult, path) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });

        server.registerContextMiddleware();

        const route = {
          path,
          method: 'GET' as const,
          handler: async () => expectedResult,
          responseType: 'json' as const,
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(new Request(`http://localhost${path}`));

        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body).toEqual(expectedResult);

        const contentType = response.headers.get('content-type');
        if (contentType) {
          expect(contentType).toContain('json');
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('returns JSON-parseable response for complex nested objects', async () => {
    // Generate ISO date strings directly to avoid any Date parsing issues
    const validDateArb = fc
      .tuple(
        fc.integer({ min: 2000, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.integer({ min: 0, max: 59 })
      )
      .map(
        ([year, month, day, hour, min, sec]) =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.000Z`
      );

    const complexObjectArb = fc.record({
      id: fc.integer({ min: 1, max: 10000 }),
      name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,29}$/),
      active: fc.boolean(),
      tags: fc.array(fc.stringMatching(/^[a-z]{2,10}$/), { minLength: 0, maxLength: 5 }),
      metadata: fc.record({
        createdAt: validDateArb,
        updatedAt: validDateArb,
        version: fc.integer({ min: 1, max: 100 }),
      }),
    });

    await fc.assert(
      fc.asyncProperty(complexObjectArb, pathArb, async (expectedResult, path) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });

        server.registerContextMiddleware();

        const route = {
          path,
          method: 'GET' as const,
          handler: async () => expectedResult,
          responseType: 'json' as const,
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(new Request(`http://localhost${path}`));

        expect(response.status).toBe(200);

        const body = await response.json();
        expect(body).toEqual(expectedResult);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('returns JSON-parseable response for POST routes with responseType json', async () => {
    await fc.assert(
      fc.asyncProperty(
        jsonObjectArb,
        jsonObjectArb,
        pathArb,
        async (requestBody, expectedResult, path) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'POST' as const,
            handler: async () => expectedResult,
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(
            new Request(`http://localhost${path}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody),
            })
          );

          expect(response.status).toBe(200);

          const body = await response.json();
          expect(body).toEqual(expectedResult);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns JSON-parseable response for array results', async () => {
    await fc.assert(
      fc.asyncProperty(jsonArrayArb, pathArb, async (expectedResult, path) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });

        server.registerContextMiddleware();

        const route = {
          path,
          method: 'GET' as const,
          handler: async () => expectedResult,
          responseType: 'json' as const,
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(new Request(`http://localhost${path}`));

        expect(response.status).toBe(200);

        const body = (await response.json()) as Array<{ id: number; value: string }>;
        expect(body).toEqual(expectedResult);
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(expectedResult.length);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('JSON response round-trip preserves data integrity for objects', async () => {
    await fc.assert(
      fc.asyncProperty(jsonObjectArb, pathArb, async (originalData, path) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });

        server.registerContextMiddleware();

        const route = {
          path,
          method: 'GET' as const,
          handler: async () => originalData,
          responseType: 'json' as const,
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(new Request(`http://localhost${path}`));

        expect(response.status).toBe(200);

        const body = await response.json();
        const roundTripped = JSON.parse(JSON.stringify(originalData));
        expect(body).toEqual(roundTripped);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
