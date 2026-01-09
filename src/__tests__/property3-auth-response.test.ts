/**
 * Property-based tests for ElysiaServer - Property 3: Authentication Response Codes
 * 
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';

/**
 * Feature: elysia-mastra-adapter, Property 3: Authentication Response Codes
 * 
 * For any request where authentication is configured:
 * - If authentication fails, response status SHALL be 401
 * - If authorization fails, response status SHALL be 403
 * - If authentication succeeds, user SHALL be attached to context
 */
describe('Property 3: Authentication Response Codes', () => {
  const createMockMastraWithAuth = (authConfig?: {
    authenticateToken?: (token: string, request: unknown) => Promise<unknown>;
    authorize?: (path: string, method: string, user: unknown, context: unknown) => Promise<boolean>;
    authorizeUser?: (user: unknown, request: unknown) => Promise<boolean> | boolean;
  }) => {
    return {
      getServer: () => authConfig ? { auth: authConfig } : null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const tokenArb = fc.stringMatching(/^[a-zA-Z0-9]{8,32}$/);

  const userArb = fc.record({
    id: fc.integer({ min: 1, max: 10000 }),
    role: fc.constantFrom('admin', 'user', 'moderator'),
    email: fc.emailAddress(),
  });

  const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE');

  const pathArb = fc
    .array(fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/), { minLength: 1, maxLength: 3 })
    .map((segments) => '/' + segments.join('/'));

  test('returns 401 when authentication fails for any invalid token', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        pathArb,
        async (invalidToken, path) => {
          const app = new Elysia();
          
          const mastra = createMockMastraWithAuth({
            authenticateToken: async () => null,
          });

          const server = new ElysiaServer({ app, mastra });
          server.registerAuthMiddleware();

          app.get(path, () => ({ ok: true }));

          const response = await app.handle(
            new Request(`http://localhost${path}`, {
              headers: { Authorization: `Bearer ${invalidToken}` },
            })
          );

          expect(response.status).toBe(401);
          
          const body = await response.json();
          expect(body).toEqual({ error: 'Unauthorized' });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns 403 when authorization fails for any authenticated user', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        userArb,
        pathArb,
        httpMethodArb,
        async (validToken, user, path, method) => {
          const app = new Elysia();
          
          const mastra = createMockMastraWithAuth({
            authenticateToken: async () => user,
            authorize: async () => false,
          });

          const server = new ElysiaServer({ app, mastra });
          server.registerAuthMiddleware();

          const methodLower = method.toLowerCase();
          if (methodLower === 'get') app.get(path, () => ({ ok: true }));
          else if (methodLower === 'post') app.post(path, () => ({ ok: true }));
          else if (methodLower === 'put') app.put(path, () => ({ ok: true }));
          else if (methodLower === 'delete') app.delete(path, () => ({ ok: true }));

          const response = await app.handle(
            new Request(`http://localhost${path}`, {
              method,
              headers: { Authorization: `Bearer ${validToken}` },
            })
          );

          expect(response.status).toBe(403);
          
          const body = await response.json();
          expect(body).toEqual({ error: 'Forbidden' });

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('attaches user to context when authentication succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        tokenArb,
        userArb,
        pathArb,
        async (validToken, expectedUser, path) => {
          const app = new Elysia();
          
          const mastra = createMockMastraWithAuth({
            authenticateToken: async () => expectedUser,
            authorize: async () => true,
          });

          const server = new ElysiaServer({ app, mastra });
          server.registerAuthMiddleware();

          let attachedUser: unknown = undefined;

          app.get(path, (context) => {
            const ctx = context as unknown as { user: unknown };
            attachedUser = ctx.user;
            return { ok: true };
          });

          const response = await app.handle(
            new Request(`http://localhost${path}`, {
              headers: { Authorization: `Bearer ${validToken}` },
            })
          );

          expect(response.status).toBe(200);
          expect(attachedUser).toBeDefined();
          expect(attachedUser).toEqual(expectedUser);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('skips auth middleware when no auth is configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        pathArb,
        async (path) => {
          const app = new Elysia();
          const mastra = createMockMastraWithAuth(undefined);

          const server = new ElysiaServer({ app, mastra });
          server.registerAuthMiddleware();

          app.get(path, () => ({ ok: true }));

          const response = await app.handle(new Request(`http://localhost${path}`));

          expect(response.status).toBe(200);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
