import { Elysia } from 'elysia';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { ElysiaServer, mastra } from '../../../src/index.js';

// Create an agent for testing
const testAgent = new Agent({
  id: 'test-agent',
  instructions: 'You are a test agent',
  model: 'openai/gpt-4o-mini',
  name: 'testAgent',
});

// Create Mastra instance
const mastraInstance = new Mastra({
  agents: {
    testAgent,
  },
});

// Option 1: Using the mastra() plugin only
// Types are automatically inferred - no manual typing needed!

const app1 = new Elysia()
  .use(mastra({ mastra: mastraInstance }))
  .get('/info', ({ tools, abortSignal }) => {
    // tools and abortSignal are automatically typed!
    return {
      hasContext: true,
      toolCount: Object.keys(tools ?? {}).length,
      isAborted: abortSignal.aborted,
    };
  })
  .get('/agents', ({ mastra }) => {
    // mastra is properly typed!
    const agent = mastra.getAgent('testAgent');
    return { agent: agent?.name ?? 'not found' };
  });

// Option 2: Using ElysiaServer with plugin for custom routes
// Best for production - gets Mastra's built-in routes + type-safe custom routes

const app2 = new Elysia()
  // Add plugin first for type inference on custom routes
  .use(mastra({ mastra: mastraInstance }))
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))
  .get('/status', ({ abortSignal }) => {
    // abortSignal is typed thanks to the plugin
    return {
      uptime: process.uptime(),
      isAborted: abortSignal.aborted,
    };
  });

// Create ElysiaServer for Mastra's built-in routes
const server = new ElysiaServer({
  app: app2,
  mastra: mastraInstance,
  prefix: '/api',
  bodyLimitOptions: {
    maxSize: 5 * 1024 * 1024, // 5MB
    onError: (error) => ({
      error: 'PAYLOAD_TOO_LARGE',
      message: error instanceof Error ? error.message : 'Payload too large',
    }),
  },
});

// Register Mastra routes (skip context middleware since plugin already added it)
await server.registerRoutes();

const port = process.env.PORT || 3000;
app2.listen(port);

console.log(`Server running at http://localhost:${port}`);
console.log(`Health check: http://localhost:${port}/health`);
console.log(`Status: http://localhost:${port}/status`);
console.log(`Mastra API: http://localhost:${port}/api`);
