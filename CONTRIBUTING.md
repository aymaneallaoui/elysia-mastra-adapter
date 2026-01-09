# Contributing to elysia-mastra

Thank you for your interest in contributing to elysia-mastra! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0.0
- [Node.js](https://nodejs.org/) >= 18.0.0 (for npm publishing)

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/your-username/elysia-mastra.git
   cd elysia-mastra
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run the tests to make sure everything works:
   ```bash
   bun test
   ```

## Development Workflow

### Available Scripts

| Script | Description |
|--------|-------------|
| `bun run build` | Build the project |
| `bun run dev` | Run in development mode with watch |
| `bun test` | Run tests |
| `bun test --watch` | Run tests in watch mode |
| `bun run lint` | Run ESLint |
| `bun run lint:fix` | Run ESLint with auto-fix |
| `bun run format` | Format code with Prettier |
| `bun run format:check` | Check code formatting |
| `bun run typecheck` | Run TypeScript type checking |

### Code Style

This project uses:
- **ESLint** for linting
- **Prettier** for code formatting
- **TypeScript** for type safety

Before submitting a PR, make sure your code:
1. Passes linting: `bun run lint`
2. Passes type checking: `bun run typecheck`
3. Is properly formatted: `bun run format`
4. All tests pass: `bun test`

## Making Changes

### Creating a Branch

Create a branch for your changes:
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### Commit Messages

We use conventional commits. Your commit messages should follow this format:
```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(server): add support for custom middleware
fix(streaming): resolve SSE connection timeout
docs: update README with new examples
```

### Adding a Changeset

For any user-facing changes, add a changeset:

```bash
bunx changeset
```

This will prompt you to:
1. Select the type of change (major, minor, patch)
2. Write a summary of your changes

The changeset will be used to generate the changelog when releasing.

### Submitting a Pull Request

1. Push your changes to your fork
2. Create a pull request against the `main` branch
3. Fill out the PR template
4. Wait for CI checks to pass
5. Request a review

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run a specific test file
bun test src/__tests__/server.test.ts
```

### Writing Tests

Tests are located in `src/__tests__/`. We use Bun's built-in test runner.

```typescript
import { describe, test, expect } from 'bun:test';

describe('MyFeature', () => {
  test('should do something', () => {
    expect(true).toBe(true);
  });
});
```

## Project Structure

```
elysia-mastra/
├── src/
│   ├── index.ts        # Main exports
│   ├── server.ts       # ElysiaServer implementation
│   ├── plugin.ts       # mastra() plugin
│   ├── types.ts        # TypeScript type definitions
│   └── __tests__/      # Test files
├── examples/           # Example implementations
├── dist/               # Built output (generated)
└── .github/            # GitHub workflows and templates
```

## Release Process

Releases are automated using [Changesets](https://github.com/changesets/changesets):

1. Contributors add changesets with their PRs
2. When PRs are merged, a "Release" PR is automatically created
3. Merging the Release PR publishes to npm and creates a GitHub release

## Getting Help

- Open an issue for bugs or feature requests
- Start a discussion for questions
- Check existing issues before creating new ones

## Code of Conduct

Please be respectful and constructive in all interactions. We're all here to build great software together.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
