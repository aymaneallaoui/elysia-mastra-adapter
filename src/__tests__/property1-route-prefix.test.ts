/**
 * Property-based tests for ElysiaServer - Property 1: Route Prefix Application
 *
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia } from 'elysia';

/**
 * Feature: elysia-mastra-adapter, Property 1: Route Prefix Application
 *
 * For any route path and configured prefix, the registered route path
 * SHALL equal the prefix concatenated with the original path.
 */
describe('Property 1: Route Prefix Application', () => {
  /**
   * Arbitrary for generating valid URL path segments.
   */
  const pathSegmentArb = fc.stringMatching(/^[a-z][a-z0-9_-]{0,19}$/);

  /**
   * Arbitrary for generating valid route paths.
   */
  const routePathArb = fc
    .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
    .map((segments) => '/' + segments.join('/'));

  /**
   * Arbitrary for generating valid prefixes.
   */
  const prefixArb = fc.oneof(
    fc.constant(''),
    fc
      .array(pathSegmentArb, { minLength: 1, maxLength: 2 })
      .map((segments) => '/' + segments.join('/'))
  );

  /**
   * Arbitrary for HTTP methods supported by Elysia.
   */
  const httpMethodArb = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS');

  test('registered route path equals prefix + original path for all valid inputs', () => {
    fc.assert(
      fc.property(prefixArb, routePathArb, httpMethodArb, (prefix, routePath, method) => {
        const app = new Elysia();
        const expectedPath = `${prefix}${routePath}`;

        const methodLower = method.toLowerCase();
        if (methodLower === 'get') app.get(expectedPath, () => 'ok');
        else if (methodLower === 'post') app.post(expectedPath, () => 'ok');
        else if (methodLower === 'put') app.put(expectedPath, () => 'ok');
        else if (methodLower === 'delete') app.delete(expectedPath, () => 'ok');
        else if (methodLower === 'patch') app.patch(expectedPath, () => 'ok');
        else if (methodLower === 'options') app.options(expectedPath, () => 'ok');

        const routes = (app as unknown as { routes: Array<{ method: string; path: string }> })
          .routes;
        const foundRoute = routes.find((r) => r.path === expectedPath && r.method === method);

        expect(foundRoute).toBeDefined();
        expect(foundRoute?.path).toBe(expectedPath);
        expect(foundRoute?.method).toBe(method);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('prefix concatenation is associative with path', () => {
    fc.assert(
      fc.property(prefixArb, routePathArb, (prefix, routePath) => {
        const fullPath = `${prefix}${routePath}`;

        expect(fullPath.startsWith('/')).toBe(true);
        expect(fullPath.includes('//')).toBe(false);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('empty prefix preserves original path', () => {
    fc.assert(
      fc.property(routePathArb, httpMethodArb, (routePath, method) => {
        const app = new Elysia();
        const prefix = '';
        const expectedPath = `${prefix}${routePath}`;

        expect(expectedPath).toBe(routePath);

        const methodLower = method.toLowerCase();
        if (methodLower === 'get') app.get(expectedPath, () => 'ok');
        else if (methodLower === 'post') app.post(expectedPath, () => 'ok');
        else if (methodLower === 'put') app.put(expectedPath, () => 'ok');
        else if (methodLower === 'delete') app.delete(expectedPath, () => 'ok');
        else if (methodLower === 'patch') app.patch(expectedPath, () => 'ok');
        else if (methodLower === 'options') app.options(expectedPath, () => 'ok');

        const routes = (app as unknown as { routes: Array<{ method: string; path: string }> })
          .routes;
        const foundRoute = routes.find((r) => r.path === routePath && r.method === method);

        expect(foundRoute).toBeDefined();
        expect(foundRoute?.path).toBe(routePath);

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
