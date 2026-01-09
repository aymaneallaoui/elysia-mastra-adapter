/**
 * Property-based tests for ElysiaServer - Property 7: Streaming Headers and Format
 * 
 * Uses fast-check to verify universal properties across many generated inputs.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { Elysia, type Context } from 'elysia';
import { ElysiaServer } from '../server';
import type { Mastra } from '@mastra/core/mastra';
import type { ServerRoute } from '@mastra/server/server-adapter';

/**
 * Feature: elysia-mastra-adapter, Property 7: Streaming Headers and Format
 * 
 * For any streaming response:
 * - If SSE format, Content-Type SHALL be `text/event-stream`
 * - Transfer-Encoding SHALL be `chunked`
 * - If redaction enabled, sensitive data SHALL be removed from chunks
 * - Completion marker SHALL be sent when stream ends
 */
describe('Property 7: Streaming Headers and Format', () => {
  const createMockMastra = () => {
    return {
      getServer: () => null,
      getAgent: () => null,
      getWorkflow: () => null,
      getTools: () => ({}),
      setMastraServer: () => {},
    } as unknown as Mastra;
  };

  const createMockStream = (chunks: unknown[]): ReadableStream => {
    let index = 0;
    return new ReadableStream({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index++;
        } else {
          controller.close();
        }
      },
    });
  };

  // Helper to create a streaming route with proper type assertion
  const createStreamRoute = (
    path: string, 
    chunks: unknown[], 
    streamFormat: 'sse' | 'ndjson'
  ) => ({
    path,
    method: 'GET' as const,
    handler: async () => ({
      fullStream: createMockStream(chunks),
    }),
    responseType: 'stream' as const,
    streamFormat,
  }) as unknown as ServerRoute;


  const streamChunkArb = fc.record({
    type: fc.constantFrom('text', 'data', 'event'),
    content: fc.stringMatching(/^[a-zA-Z0-9 ]{1,50}$/),
    timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
  });

  const streamChunksArb = fc.array(streamChunkArb, { minLength: 1, maxLength: 10 });

  const pathArb = fc
    .array(fc.stringMatching(/^[a-z][a-z0-9_-]{0,9}$/), { minLength: 1, maxLength: 3 })
    .map((segments) => '/' + segments.join('/'));

  const streamFormatArb = fc.constantFrom('sse', 'ndjson') as fc.Arbitrary<'sse' | 'ndjson'>;

  test('SSE format sets Content-Type to text/event-stream', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        async (chunks, path) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, 'sse');
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          expect((result as Response).headers.get('Content-Type')).toBe('text/event-stream');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('ndjson format sets Content-Type to text/plain', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        async (chunks, path) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, 'ndjson');
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          expect((result as Response).headers.get('Content-Type')).toBe('text/plain');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('streaming response sets Transfer-Encoding to chunked', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        streamFormatArb,
        async (chunks, path, streamFormat) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, streamFormat);
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          expect((result as Response).headers.get('Transfer-Encoding')).toBe('chunked');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  test('SSE format sends completion marker [DONE] when stream ends', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        async (chunks, path) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, 'sse');
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          const response = result as Response;
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullContent += decoder.decode(value, { stream: true });
          }

          expect(fullContent).toContain('data: [DONE]');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('SSE format outputs data in correct SSE format (data: {json}\\n\\n)', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        async (chunks, path) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, 'sse');
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          const response = result as Response;
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullContent += decoder.decode(value, { stream: true });
          }

          const events = fullContent.split('\n\n').filter(e => e.trim());
          for (const event of events) {
            expect(event.startsWith('data: ')).toBe(true);
            const jsonPart = event.slice(6);
            if (jsonPart !== '[DONE]') {
              expect(() => JSON.parse(jsonPart)).not.toThrow();
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('ndjson format outputs data with record separator', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        async (chunks, path) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, 'ndjson');
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          const response = result as Response;
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullContent += decoder.decode(value, { stream: true });
          }

          const records = fullContent.split('\x1E').filter(r => r.trim());
          for (const record of records) {
            expect(() => JSON.parse(record)).not.toThrow();
          }
          expect(records.length).toBe(chunks.length);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });


  test('streaming sets Cache-Control to no-cache', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        streamFormatArb,
        async (chunks, path, streamFormat) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, streamFormat);
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          expect((result as Response).headers.get('Cache-Control')).toBe('no-cache');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('streaming sets Connection to keep-alive', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        streamFormatArb,
        async (chunks, path, streamFormat) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, streamFormat);
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          expect((result as Response).headers.get('Connection')).toBe('keep-alive');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('stream data integrity - all chunks are present in output', async () => {
    await fc.assert(
      fc.asyncProperty(
        streamChunksArb,
        pathArb,
        streamFormatArb,
        async (chunks, path, streamFormat) => {
          const app = new Elysia();
          const mastra = createMockMastra();
          const server = new ElysiaServer({ app, mastra, streamOptions: { redact: false } });
          server.registerContextMiddleware();

          const route = createStreamRoute(path, chunks, streamFormat);
          const mockContext = { set: { status: 200, headers: {} as Record<string, string> } } as Context;
          const result = await server.stream(route, mockContext, { fullStream: createMockStream(chunks) });

          expect(result).toBeInstanceOf(Response);
          const response = result as Response;
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullContent += decoder.decode(value, { stream: true });
          }

          for (const chunk of chunks) {
            const chunkJson = JSON.stringify(chunk);
            expect(fullContent).toContain(chunkJson);
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
