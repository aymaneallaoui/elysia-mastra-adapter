/**
 * Property-based tests for ElysiaServer - Property 8: Error Status Codes
 * 
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';

/**
 * Feature: elysia-mastra-adapter, Property 8: Error Status Codes
 * 
 * For any error thrown during request handling:
 * - Validation errors SHALL return status 400
 * - Internal errors SHALL return status 500
 * - Errors with explicit status SHALL return that status
 */
describe('Property 8: Error Status Codes', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const pathArb = fc
    .array(fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/), { minLength: 1, maxLength: 3 })
    .map((segments) => '/' + segments.join('/'));

  const validationErrorMessageArb = fc.oneof(
    fc.constant('Validation failed'),
    fc.constant('Invalid input'),
    fc.constant('validation error: field is required'),
    fc.stringMatching(/^[a-zA-Z ]{5,30}$/).map(s => `validation: ${s}`),
  );

  const internalErrorMessageArb = fc.oneof(
    fc.constant('Database connection failed'),
    fc.constant('Unexpected error'),
    fc.constant('Service unavailable'),
    fc.stringMatching(/^[a-zA-Z ]{5,30}$/),
  );

  const explicitStatusArb = fc.constantFrom(
    400, 401, 403, 404, 405, 409, 422, 429,
    500, 501, 502, 503, 504
  );

  const clientErrorStatusArb = fc.constantFrom(400, 401, 403, 404, 405, 409, 422, 429);

  const serverErrorStatusArb = fc.constantFrom(500, 501, 502, 503, 504);

  test('returns 400 for validation errors (ZodError) for any invalid input', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        validationErrorMessageArb,
        async (path, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { 
                name: string; 
                issues: Array<{ message: string }>;
              };
              error.name = 'ZodError';
              error.issues = [{ message: errorMessage }];
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(400);

          const body = await response.json() as { error: string; message: string };
          expect(body.error).toBe('VALIDATION_ERROR');
          expect(body.message).toBeDefined();

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns 400 for errors with status 400 for any error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        validationErrorMessageArb,
        async (path, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { status: number };
              error.status = 400;
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(400);

          const body = await response.json() as { error: string };
          expect(body.error).toBe('VALIDATION_ERROR');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns 400 for errors with details.status 400 for any error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        validationErrorMessageArb,
        async (path, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { 
                details: { status: number };
              };
              error.details = { status: 400 };
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(400);

          const body = await response.json() as { error: string };
          expect(body.error).toBe('VALIDATION_ERROR');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns 500 for internal errors without explicit status for any error', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        internalErrorMessageArb,
        async (path, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              throw new Error(errorMessage);
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(500);

          const body = await response.json() as { error: string; message: string };
          expect(body.error).toBe('INTERNAL_ERROR');
          expect(body.message).toBe('An unexpected error occurred');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns explicit status code when error has status property for any status', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        explicitStatusArb,
        internalErrorMessageArb,
        async (path, explicitStatus, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { status: number };
              error.status = explicitStatus;
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(explicitStatus);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns explicit status code when error has details.status property for any status', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        explicitStatusArb,
        internalErrorMessageArb,
        async (path, explicitStatus, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { 
                details: { status: number };
              };
              error.details = { status: explicitStatus };
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(explicitStatus);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('4xx errors return error message in response for any client error', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        clientErrorStatusArb.filter(s => s !== 400),
        internalErrorMessageArb,
        async (path, clientErrorStatus, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { status: number };
              error.status = clientErrorStatus;
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(clientErrorStatus);

          const body = await response.json() as { error: string; message: string };
          expect(body.error).toBe('ERROR');
          expect(body.message).toBe(errorMessage);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('5xx errors return generic message for any server error', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        serverErrorStatusArb,
        internalErrorMessageArb,
        async (path, serverErrorStatus, errorMessage) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error(errorMessage) as Error & { status: number };
              error.status = serverErrorStatus;
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(serverErrorStatus);

          const body = await response.json() as { error: string; message: string };
          expect(body.error).toBe('INTERNAL_ERROR');
          expect(body.message).toBe('An unexpected error occurred');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('validation errors include error details when available for any ZodError', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        fc.array(
          fc.record({
            path: fc.array(fc.stringMatching(/^[a-z]{1,10}$/), { minLength: 1, maxLength: 3 }),
            message: fc.stringMatching(/^[a-zA-Z ]{5,30}$/),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        async (path, issues) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error('Validation failed') as Error & { 
                name: string; 
                issues: typeof issues;
              };
              error.name = 'ZodError';
              error.issues = issues;
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(400);

          const body = await response.json() as { 
            error: string; 
            details: Array<{ path: string[]; message: string }>;
          };
          expect(body.error).toBe('VALIDATION_ERROR');
          expect(body.details).toBeDefined();
          expect(body.details).toEqual(issues);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('error status takes precedence: status > details.status > default', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        explicitStatusArb,
        explicitStatusArb,
        async (path, primaryStatus, secondaryStatus) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({ app, mastra });

          server.registerContextMiddleware();

          const route = {
            path,
            method: 'GET' as const,
            handler: async () => {
              const error = new Error('Test error') as Error & { 
                status: number;
                details: { status: number };
              };
              error.status = primaryStatus;
              error.details = { status: secondaryStatus };
              throw error;
            },
            responseType: 'json' as const,
          };

          await server.registerRoute(app, route, {});

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(primaryStatus);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
