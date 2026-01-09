import { Elysia } from 'elysia';
import { Mastra } from '@mastra/core';
import { ElysiaServer, mastra } from '../../../src/index.js';
import { z } from 'zod';

// Define custom tools with proper typing
const customTools = {
  calculator: {
    description: 'Performs basic mathematical calculations',
    parameters: z.object({
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      a: z.number().describe('First number'),
      b: z.number().describe('Second number'),
    }),
    execute: async ({ operation, a, b }: { operation: string; a: number; b: number }) => {
      switch (operation) {
        case 'add':
          return { result: a + b, operation: `${a} + ${b} = ${a + b}` };
        case 'subtract':
          return { result: a - b, operation: `${a} - ${b} = ${a - b}` };
        case 'multiply':
          return { result: a * b, operation: `${a} * ${b} = ${a * b}` };
        case 'divide':
          if (b === 0) throw new Error('Division by zero is not allowed');
          return { result: a / b, operation: `${a} / ${b} = ${a / b}` };
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    },
  },

  weather: {
    description: 'Gets weather information for a city',
    parameters: z.object({
      city: z.string().describe('City name'),
      units: z.enum(['celsius', 'fahrenheit']).default('celsius'),
    }),
    execute: async ({ city, units }: { city: string; units: string }) => {
      const mockWeather = {
        city,
        temperature: units === 'celsius' ? 22 : 72,
        units: units === 'celsius' ? 'C' : 'F',
        condition: 'Sunny',
        humidity: 65,
        windSpeed: 10,
      };

      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        weather: mockWeather,
        message: `Current weather in ${city}: ${mockWeather.temperature}${mockWeather.units}, ${mockWeather.condition}`,
      };
    },
  },

  textProcessor: {
    description: 'Processes text with various operations',
    parameters: z.object({
      text: z.string().describe('Text to process'),
      operation: z.enum(['uppercase', 'lowercase', 'reverse', 'wordcount', 'summary']),
    }),
    execute: async ({ text, operation }: { text: string; operation: string }) => {
      switch (operation) {
        case 'uppercase':
          return { result: text.toUpperCase(), operation: 'Converted to uppercase' };
        case 'lowercase':
          return { result: text.toLowerCase(), operation: 'Converted to lowercase' };
        case 'reverse':
          return { result: text.split('').reverse().join(''), operation: 'Text reversed' };
        case 'wordcount':
          { const wordCount = text.trim().split(/\s+/).length;
          return { result: wordCount, operation: `Counted ${wordCount} words` }; }
        case 'summary':
          { const summary = text.length > 100 ? text.substring(0, 100) + '...' : text;
          return { result: summary, operation: 'Generated summary' }; }
        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    },
  },
};

interface Tool {
  description: string;
  execute: (params: unknown) => Promise<unknown>;
}

const mastraInstance = new Mastra({});

const app = new Elysia()
  .use(mastra({ mastra: mastraInstance, tools: customTools }))
  .post('/test-tool/:toolName', async ({ params, body, tools, set }) => {
    const toolName = params.toolName;

    if (!tools || !(toolName in tools)) {
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
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      set.status = 400;
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        tool: toolName,
        parameters: body,
      };
    }
  })
  .get('/tools', ({ tools }) => {
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
  })
  .get('/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    tools: Object.keys(customTools),
  }));

const server = new ElysiaServer({
  app: app,
  mastra: mastraInstance,
  prefix: '/api',
  tools: customTools,
});

await server.registerRoutes();

const port = process.env.PORT || 3000;
app.listen(port);

console.log(`Server running at http://localhost:${port}`);
console.log(`Custom tools available:`);
Object.entries(customTools).forEach(([tool, config]) => {
  console.log(`   - ${tool}: ${config.description}`);
});

console.log(`\nTry these endpoints:`);
console.log(`GET /tools - List all available tools`);
console.log(`POST /test-tool/:toolName - Test a tool directly`);
console.log(`GET /api/* - Mastra API with custom tools`);

console.log(`\nExample tool tests:`);
console.log(`POST /test-tool/calculator`);
console.log(`  Body: {"operation": "add", "a": 5, "b": 3}`);
console.log(`POST /test-tool/weather`);
console.log(`  Body: {"city": "New York", "units": "celsius"}`);
console.log(`POST /test-tool/textProcessor`);
console.log(`  Body: {"text": "Hello World", "operation": "uppercase"}`);
