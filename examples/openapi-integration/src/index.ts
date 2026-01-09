import { Elysia, t } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { Mastra } from '@mastra/core';
import { ElysiaServer, mastra } from '../../../src/index.js';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';

interface Tool {
  description: string;
  execute: (params: unknown) => Promise<unknown>;
}

const customTools = {
  userManager: {
    description: 'Manages user operations',
    parameters: z.object({
      action: z.enum(['create', 'get', 'update', 'delete']).describe('Action to perform'),
      userId: z.string().optional().describe('User ID (required for get, update, delete)'),
      userData: z
        .object({
          name: z.string().describe('User name'),
          email: z.string().email().describe('User email'),
          role: z.enum(['admin', 'user', 'guest']).describe('User role'),
        })
        .optional()
        .describe('User data (required for create, update)'),
    }),
    execute: async ({
      action,
      userId,
      userData,
    }: {
      action: 'create' | 'get' | 'update' | 'delete';
      userId?: string;
      userData?: { name: string; email: string; role: 'admin' | 'user' | 'guest' };
    }) => {
      switch (action) {
        case 'create':
          return {
            success: true,
            user: { id: 'user_123', ...userData },
            message: 'User created successfully',
          };
        case 'get':
          return {
            success: true,
            user: { id: userId, name: 'John Doe', email: 'john@example.com', role: 'user' },
          };
        case 'update':
          return {
            success: true,
            user: { id: userId, ...userData },
            message: 'User updated successfully',
          };
        case 'delete':
          return {
            success: true,
            message: 'User deleted successfully',
          };
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  },
};

// Create an example agent
const agent = new Agent({
  id: 'example-agent',
  instructions: 'You are a helpful assistant.',
  model: 'openrouter/anthropic/claude-3.5-haiku',
  name: 'Example Agent',
});

// Configure Mastra with the agent
const mastraInstance = new Mastra({
  agents: {
    agent,
  },
});

// Create Elysia app with Swagger and Mastra plugin (chained for type inference)
const app = new Elysia()
  .use(
    swagger({
      documentation: {
        info: {
          title: 'Elysia-Mastra API Documentation',
          version: '1.0.0',
          description:
            'Complete API documentation for Elysia-Mastra integration with custom endpoints and tools',
          contact: {
            name: 'API Support',
            email: 'support@example.com',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
        servers: [
          {
            url: 'http://localhost:3000',
            description: 'Development server',
          },
          {
            url: 'https://api.example.com',
            description: 'Production server',
          },
        ],
        tags: [
          {
            name: 'Health',
            description: 'Health check endpoints',
          },
          {
            name: 'Users',
            description: 'User management operations',
          },
          {
            name: 'Tools',
            description: 'Custom tool operations',
          },
          {
            name: 'Mastra',
            description: 'Mastra AI endpoints (agents, workflows, tools)',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
      path: '/docs', // Swagger UI will be available at /docs
    })
  )
  .use(mastra({ mastra: mastraInstance, tools: customTools }));

// Create adapter with OpenAPI configuration
const server = new ElysiaServer({
  app,
  mastra: mastraInstance,
  prefix: '/api/v1',
  openapiPath: '/api/openapi.json', // Custom OpenAPI spec endpoint
  tools: customTools,
});

// Initialize the server (skip context middleware since plugin already added it)
await server.registerRoutes();

// Custom endpoints with OpenAPI schemas

// Health check endpoint
app.get(
  '/health',
  () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }),
  {
    detail: {
      tags: ['Health'],
      summary: 'Health check',
      description: 'Returns the current health status of the API',
      responses: {
        200: {
          description: 'API is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'string', format: 'date-time' },
                  version: { type: 'string', example: '1.0.0' },
                },
              },
            },
          },
        },
      },
    },
  }
);

app.group('/users', (app) =>
  app
    .get(
      '/',
      ({ query }) => {
        const { page = 1, limit = 10, role } = query;

        const users = Array.from({ length: Number(limit) }, (_, i) => ({
          id: `user_${page}_${i + 1}`,
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
          role: role || 'user',
          createdAt: new Date().toISOString(),
        }));

        return {
          users,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: 100,
            pages: Math.ceil(100 / Number(limit)),
          },
        };
      },
      {
        query: t.Object({
          page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
          limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 10 })),
          role: t.Optional(t.Union([t.Literal('admin'), t.Literal('user'), t.Literal('guest')])),
        }),
        detail: {
          tags: ['Users'],
          summary: 'List users',
          description: 'Retrieve a paginated list of users with optional role filtering',
          responses: {
            200: {
              description: 'List of users',
            },
          },
        },
      }
    )
    .get(
      '/:id',
      ({ params }) => {
        return {
          id: params.id,
          name: 'John Doe',
          email: 'john@example.com',
          role: 'user',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: new Date().toISOString(),
        };
      },
      {
        params: t.Object({
          id: t.String({ minLength: 1, description: 'User ID' }),
        }),
        detail: {
          tags: ['Users'],
          summary: 'Get user by ID',
          description: 'Retrieve a specific user by their ID',
          responses: {
            200: { description: 'User details' },
            404: { description: 'User not found' },
          },
        },
      }
    )
    .post(
      '/',
      ({ body }) => {
        return {
          id: 'user_new_123',
          ...body,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 100, description: 'User full name' }),
          email: t.String({ format: 'email', description: 'User email address' }),
          role: t.Union([t.Literal('admin'), t.Literal('user'), t.Literal('guest')], {
            description: 'User role',
          }),
        }),
        detail: {
          tags: ['Users'],
          summary: 'Create new user',
          description: 'Create a new user account',
          security: [{ bearerAuth: [] }],
          responses: {
            201: { description: 'User created successfully' },
            400: { description: 'Invalid input data' },
            401: { description: 'Authentication required' },
          },
        },
      }
    )
);

// Tool testing endpoint with proper typing
app.post(
  '/tools/:toolName/execute',
  async (context) => {
    const { params, body, tools, set } = context;

    const toolName = params.toolName;

    if (!toolName || !tools || !(toolName in tools)) {
      set.status = 404;
      return { error: `Tool '${toolName}' not found` };
    }

    try {
      const tool = tools[toolName as keyof typeof tools] as Tool;
      const result = await tool.execute(body);

      return {
        tool: toolName,
        parameters: body,
        result,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      set.status = 400;
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        tool: toolName,
        parameters: body,
      };
    }
  },
  {
    params: t.Object({
      toolName: t.String({ description: 'Name of the tool to execute' }),
    }),
    body: t.Any({ description: 'Tool parameters (varies by tool)' }),
    detail: {
      tags: ['Tools'],
      summary: 'Execute a tool',
      description: 'Execute a custom tool with the provided parameters',
      responses: {
        200: { description: 'Tool executed successfully' },
        400: { description: 'Tool execution failed' },
        404: { description: 'Tool not found' },
      },
    },
  }
);

// List available tools with proper typing
app.get(
  '/tools',
  (context) => {
    const { tools } = context;

    if (!tools) {
      return { tools: [], count: 0 };
    }

    const toolList = Object.entries(tools).map(([name, tool]) => ({
      name,
      description: (tool as Tool).description || 'No description available',
    }));

    return {
      tools: toolList,
      count: toolList.length,
    };
  },
  {
    detail: {
      tags: ['Tools'],
      summary: 'List available tools',
      description: 'Get a list of all available custom tools',
      responses: {
        200: { description: 'List of available tools' },
      },
    },
  }
);

// API info endpoint with proper typing
app.get(
  '/info',
  (context) => {
    const { mastra, tools } = context;

    return {
      api: {
        name: 'Elysia-Mastra OpenAPI Example',
        version: '1.0.0',
        description: 'Example API showcasing OpenAPI integration',
      },
      mastra: {
        available: mastra !== undefined,
      },
      tools: {
        count: Object.keys(tools ?? {}).length,
        available: Object.keys(tools ?? {}),
      },
      endpoints: {
        swagger: '/docs',
        openapi: '/api/openapi.json',
        health: '/health',
      },
    };
  },
  {
    detail: {
      tags: ['Health'],
      summary: 'API information',
      description: 'Get information about the API, including available tools and endpoints',
    },
  }
);

const port = process.env.PORT || 3000;
app.listen(port);

console.log(`Server running at http://localhost:${port}`);
console.log(`Swagger UI: http://localhost:${port}/docs`);
console.log(`OpenAPI Spec: http://localhost:${port}/api/openapi.json`);
console.log(`API Info: http://localhost:${port}/info`);

console.log(`\nAvailable endpoints:`);
console.log(`   GET /health - Health check`);
console.log(`   GET /info - API information`);
console.log(`   GET /users - List users (with pagination)`);
console.log(`   GET /users/:id - Get user by ID`);
console.log(`   POST /users - Create new user`);
console.log(`   GET /tools - List available tools`);
console.log(`   POST /tools/:toolName/execute - Execute a tool`);
console.log(`   GET /api/v1/* - Mastra API endpoints`);

console.log(`\nTry the Swagger UI for interactive API testing!`);
