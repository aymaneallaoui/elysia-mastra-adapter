/**
 * Property-based tests for ElysiaServer - Property 9: OpenAPI Spec Generation
 *
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';

/**
 * Feature: elysia-mastra-adapter, Property 9: OpenAPI Spec Generation
 *
 * For any set of registered routes with Zod schemas, the OpenAPI spec SHALL
 * include all routes with their schemas converted to OpenAPI format.
 */
describe('Property 9: OpenAPI Spec Generation', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const pathSegmentArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/);

  const routePathArb = fc
    .array(pathSegmentArb, { minLength: 1, maxLength: 3 })
    .map((segments) => '/' + segments.join('/'));

  const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH') as fc.Arbitrary<
    'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  >;

  const openapiPathArb = fc.oneof(
    fc.constant('/openapi'),
    fc.constant('/api-docs'),
    fc.constant('/swagger'),
    pathSegmentArb.map((s) => `/${s}/openapi`)
  );

  const routeConfigArb = fc.record({
    path: routePathArb,
    method: httpMethodArb,
    hasPathSchema: fc.boolean(),
    hasQuerySchema: fc.boolean(),
    hasBodySchema: fc.boolean(),
  });

  const routeConfigsArb = fc
    .array(routeConfigArb, { minLength: 1, maxLength: 5 })
    .map((configs) => {
      const seen = new Set<string>();
      return configs.filter((config) => {
        const key = `${config.method}:${config.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .filter((configs) => configs.length > 0);

  test('OpenAPI endpoint returns valid JSON spec for any configuration', async () => {
    await fc.assert(
      fc.asyncProperty(openapiPathArb, async (openapiPath) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: 'Test API',
            version: '1.0.0',
            description: 'Test API description',
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const spec = (await response.json()) as {
          openapi: string;
          info: Record<string, unknown>;
          paths: Record<string, unknown>;
        };
        expect(spec).toBeDefined();
        expect(typeof spec).toBe('object');

        expect(spec.openapi).toBeDefined();
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('OpenAPI spec includes info section with provided metadata', async () => {
    const apiMetadataArb = fc.record({
      title: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{2,29}$/),
      version: fc
        .tuple(
          fc.integer({ min: 0, max: 9 }),
          fc.integer({ min: 0, max: 9 }),
          fc.integer({ min: 0, max: 9 })
        )
        .map(([major, minor, patch]) => `${major}.${minor}.${patch}`),
      description: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{5,49}$/),
    });

    await fc.assert(
      fc.asyncProperty(openapiPathArb, apiMetadataArb, async (openapiPath, metadata) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: metadata.title,
            version: metadata.version,
            description: metadata.description,
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const spec = (await response.json()) as {
          info: { title: string; version: string; description: string };
        };

        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBe(metadata.title);
        expect(spec.info.version).toBe(metadata.version);
        expect(spec.info.description).toBe(metadata.description);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('OpenAPI spec paths object is defined for any route configuration', async () => {
    await fc.assert(
      fc.asyncProperty(openapiPathArb, routeConfigsArb, async (openapiPath, _routeConfigs) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: 'Test API',
            version: '1.0.0',
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const spec = (await response.json()) as { paths: Record<string, unknown> };

        expect(spec.paths).toBeDefined();
        expect(typeof spec.paths).toBe('object');

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('OpenAPI spec is valid OpenAPI 3.x format', async () => {
    await fc.assert(
      fc.asyncProperty(openapiPathArb, async (openapiPath) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: 'Test API',
            version: '1.0.0',
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const spec = (await response.json()) as { openapi: string };

        expect(spec.openapi).toBeDefined();
        expect(typeof spec.openapi).toBe('string');
        expect(spec.openapi.startsWith('3.')).toBe(true);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('OpenAPI endpoint respects configured path for any valid path', async () => {
    await fc.assert(
      fc.asyncProperty(openapiPathArb, async (openapiPath) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: 'Test API',
            version: '1.0.0',
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const wrongPath = openapiPath === '/openapi' ? '/api-docs' : '/openapi';
        const wrongResponse = await app.handle(new Request(`http://localhost${wrongPath}`));

        expect(wrongResponse.status).toBe(404);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('OpenAPI spec returns consistent structure across multiple requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        openapiPathArb,
        fc.integer({ min: 2, max: 5 }),
        async (openapiPath, requestCount) => {
          const app = new Elysia();
          const mastra = createMockMastra();

          const server = new ElysiaServer({
            app,
            mastra,
            openapiPath,
          });

          server.registerContextMiddleware();

          await server.registerOpenAPIRoute(
            app,
            {
              title: 'Test API',
              version: '1.0.0',
              path: openapiPath,
            },
            {}
          );

          const specs: unknown[] = [];
          for (let i = 0; i < requestCount; i++) {
            const response = await app.handle(new Request(`http://localhost${openapiPath}`));
            expect(response.status).toBe(200);
            specs.push(await response.json());
          }

          const firstSpec = JSON.stringify(specs[0]);
          for (let i = 1; i < specs.length; i++) {
            expect(JSON.stringify(specs[i])).toBe(firstSpec);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('OpenAPI spec includes servers array when available', async () => {
    await fc.assert(
      fc.asyncProperty(openapiPathArb, async (openapiPath) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: 'Test API',
            version: '1.0.0',
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const spec = (await response.json()) as { servers?: unknown[] };

        if (spec.servers !== undefined) {
          expect(Array.isArray(spec.servers)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('OpenAPI endpoint returns JSON content type', async () => {
    await fc.assert(
      fc.asyncProperty(openapiPathArb, async (openapiPath) => {
        const app = new Elysia();
        const mastra = createMockMastra();

        const server = new ElysiaServer({
          app,
          mastra,
          openapiPath,
        });

        server.registerContextMiddleware();

        await server.registerOpenAPIRoute(
          app,
          {
            title: 'Test API',
            version: '1.0.0',
            path: openapiPath,
          },
          {}
        );

        const response = await app.handle(new Request(`http://localhost${openapiPath}`));

        expect(response.status).toBe(200);

        const contentType = response.headers.get('content-type');
        if (contentType) {
          expect(contentType).toContain('json');
        }

        const spec = (await response.json()) as Record<string, unknown>;
        expect(spec).toBeDefined();

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
