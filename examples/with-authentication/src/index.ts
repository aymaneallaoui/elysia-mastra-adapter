import { Elysia } from 'elysia';
import { Mastra } from '@mastra/core';
import {
  ElysiaServer,
  mastra,
  type MastraLogger,
  type MastraAuthContext,
} from '../../../src/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const createToken = (userId: string): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { userId, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 };

  const base64Header = btoa(JSON.stringify(header));
  const base64Payload = btoa(JSON.stringify(payload));
  const signature = btoa(`${base64Header}.${base64Payload}.${JWT_SECRET}`);

  return `${base64Header}.${base64Payload}.${signature}`;
};

const verifyToken = (token: string): { userId: string } | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadPart = parts[1];
    if (!payloadPart) return null;

    const payload = JSON.parse(atob(payloadPart));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // Expired

    return { userId: payload.userId };
  } catch {
    return null;
  }
};

interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  name: string;
}

const users: User[] = [
  { id: '1', email: 'admin@example.com', role: 'admin', name: 'Admin User' },
  { id: '2', email: 'user@example.com', role: 'user', name: 'Regular User' },
];

const authenticateToken = async (token: string, _request: unknown): Promise<User | null> => {
  try {
    if (!token) return null;

    const decoded = verifyToken(token);
    if (!decoded) return null;

    const user = users.find((u) => u.id === decoded.userId);
    return user || null;
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
};

const authorize = async (
  path: string,
  method: string,
  user: unknown,
  _context: unknown
): Promise<boolean> => {
  const typedUser = user as User | null;

  if (path === '/health' || path === '/login') {
    return true;
  }

  if (!typedUser) {
    return false;
  }

  if (typedUser.role === 'admin') {
    return true;
  }

  if (method === 'GET') {
    return true;
  }

  return false;
};

const logger: MastraLogger = {
  error: (message, error) => console.error(`[ERROR] ${message}`, error ?? ''),
  warn: (message) => console.warn(`[WARN] ${message}`),
  info: (message) => console.info(`[INFO] ${message}`),
  debug: (message) => console.debug(`[DEBUG] ${message}`),
};

const mastraInstance = new Mastra({
  server: {
    auth: {
      authenticateToken,
      authorize,
    },
  },
});

const app = new Elysia().use(mastra({ mastra: mastraInstance }));

const server = new ElysiaServer({
  app,
  mastra: mastraInstance,
  prefix: '/api',
  logger,
  customRouteAuthConfig: new Map([
    // Public endpoints - no auth required
    ['GET:/health', false],
    ['POST:/login', false],
    // Public webhook endpoints (wildcard)
    ['POST:/webhooks/*', false],
    // Admin endpoints - always require auth (even if global auth is disabled)
    ['ALL:/admin/*', true],
  ]),
});

// Register auth middleware and routes (skip context middleware since plugin added it)
server.registerAuthMiddleware();
await server.registerRoutes();

// Login endpoint (public - configured in customRouteAuthConfig)
app.post('/login', async ({ body, set }) => {
  const { email, password } = body as { email: string; password: string };

  if (password !== 'password123') {
    set.status = 401;
    return { error: 'Invalid credentials' };
  }

  const user = users.find((u) => u.email === email);
  if (!user) {
    set.status = 401;
    return { error: 'Invalid credentials' };
  }

  const token = createToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
});

app.get('/profile', (ctx) => {
  const { set } = ctx;
  const user = (ctx as typeof ctx & Partial<MastraAuthContext>).user as User | null;

  if (!user) {
    set.status = 401;
    return { error: 'Unauthorized' };
  }

  return { user };
});

app.get('/admin/users', (ctx) => {
  const { set } = ctx;
  const user = (ctx as typeof ctx & Partial<MastraAuthContext>).user as User | null;

  if (!user || user.role !== 'admin') {
    set.status = 403;
    return { error: 'Admin access required' };
  }

  return { users };
});

app.get('/health', () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}));

app.post('/webhooks/github', ({ body }) => {
  console.log('Received GitHub webhook:', body);
  return { received: true };
});

const port = process.env.PORT || 3000;
app.listen(port);

console.log(`Server running at http://localhost:${port}`);
console.log(`Authentication enabled`);
console.log(`\nTry these requests:`);
console.log(`POST /login - Login with email/password`);
console.log(`GET /profile - Get user profile (requires auth)`);
console.log(`GET /admin/users - Admin only endpoint`);
console.log(`GET /api/* - Mastra routes (auth required)`);

console.log(`\nTest credentials:`);
console.log(`Admin: admin@example.com / password123`);
console.log(`User: user@example.com / password123`);
