/**
 * Property-based tests for ElysiaServer - Property 4: Parameter Validation
 *
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';

/**
 * Feature: elysia-mastra-adapter, Property 4: Parameter Validation
 *
 * For any route with Zod schemas and invalid input, the adapter SHALL return
 * status 400 with validation error details.
 */
describe('Property 4: Parameter Validation', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const invalidIdArb = fc.oneof(
    fc.constant('abc'),
    fc.constant('xyz123'),
    fc.constant('12.34'),
    fc.constant('-1'),
    fc.constant('0'),
    fc.stringMatching(/^[a-z]{3,10}$/)
  );

  const invalidQueryValueArb = fc.oneof(
    fc.constant('abc'),
    fc.constant('not-a-number'),
    fc.constant('-5'),
    fc.constant('0'),
    fc.constant('999'),
    fc.stringMatching(/^[a-z]{3,10}$/)
  );

  const invalidBodyArb = fc.oneof(
    fc.constant({}),
    fc.constant({ name: 123 }),
    fc.constant({ name: '' }),
    fc.constant({ email: 'not-an-email' }),
    fc.constant({ name: 'Valid', email: 'invalid' }),
    fc.constant({ name: '', email: 'test@test.com' })
  );

  test('returns 400 when path parameters fail Zod validation', async () => {
    await fc.assert(
      fc.asyncProperty(invalidIdArb, async (invalidId) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });
        server.registerContextMiddleware();

        const { z } = await import('zod');
        const route = {
          path: '/users/:id',
          method: 'GET' as const,
          handler: async () => ({ ok: true }),
          responseType: 'json' as const,
          pathParamSchema: z.object({
            id: z
              .string()
              .regex(/^\d+$/, 'ID must be numeric')
              .transform(Number)
              .pipe(z.number().positive('ID must be positive')),
          }),
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(
          new Request(`http://localhost/users/${encodeURIComponent(invalidId)}`)
        );

        expect(response.status).toBe(400);

        const body = (await response.json()) as { error: string; message: string };
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.message).toBeDefined();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('returns 400 when query parameters fail Zod validation', async () => {
    await fc.assert(
      fc.asyncProperty(invalidQueryValueArb, async (invalidValue) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });
        server.registerContextMiddleware();

        const { z } = await import('zod');
        const route = {
          path: '/search',
          method: 'GET' as const,
          handler: async () => ({ ok: true }),
          responseType: 'json' as const,
          queryParamSchema: z.object({
            limit: z
              .string()
              .regex(/^\d+$/, 'Limit must be numeric')
              .transform(Number)
              .pipe(z.number().min(1).max(100)),
          }),
        };

        await server.registerRoute(app, route, {});

        const url = new URL('http://localhost/search');
        url.searchParams.set('limit', invalidValue);

        const response = await app.handle(new Request(url.toString()));

        expect(response.status).toBe(400);

        const body = (await response.json()) as { error: string; message: string };
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.message).toBeDefined();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('returns 400 when request body fails Zod validation', async () => {
    await fc.assert(
      fc.asyncProperty(invalidBodyArb, async (invalidBody) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });
        server.registerContextMiddleware();

        const { z } = await import('zod');
        const route = {
          path: '/users',
          method: 'POST' as const,
          handler: async () => ({ ok: true }),
          responseType: 'json' as const,
          bodySchema: z.object({
            name: z.string().min(1, 'Name is required'),
            email: z.string().email('Invalid email format'),
          }),
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(
          new Request('http://localhost/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(invalidBody),
          })
        );

        expect(response.status).toBe(400);

        const body = (await response.json()) as { error: string; message: string };
        expect(body.error).toBe('VALIDATION_ERROR');
        expect(body.message).toBeDefined();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('allows valid parameters through', async () => {
    const validUserArb = fc.record({
      name: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{0,49}$/),
      email: fc
        .tuple(
          fc.stringMatching(/^[a-z]{3,10}$/),
          fc.stringMatching(/^[a-z]{3,10}$/),
          fc.constantFrom('com', 'org', 'net', 'io')
        )
        .map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
    });

    await fc.assert(
      fc.asyncProperty(validUserArb, async (validUser) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({ app, mastra });
        server.registerContextMiddleware();

        const { z } = await import('zod');
        const route = {
          path: '/users',
          method: 'POST' as const,
          handler: async () => ({
            created: true,
            user: { name: validUser.name, email: validUser.email },
          }),
          responseType: 'json' as const,
          bodySchema: z.object({
            name: z.string().min(1),
            email: z.string().regex(/^[^@]+@[^@]+\.[^@]+$/),
          }),
        };

        await server.registerRoute(app, route, {});

        const response = await app.handle(
          new Request('http://localhost/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(validUser),
          })
        );

        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          created: boolean;
          user: { name: string; email: string };
        };
        expect(body.created).toBe(true);
        expect(body.user.name).toBe(validUser.name);
        expect(body.user.email).toBe(validUser.email);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
