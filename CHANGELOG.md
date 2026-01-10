# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1](https://github.com/aymaneallaoui/elysia-mastra-adapter/compare/v1.0.0...v1.0.1) (2026-01-10)

### Bug Fixes

* add cross-env and suppress logs in test environment ([4ea7ebb](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/4ea7ebb6e828372964a7ec6229186fc60ba1c1ea))

## 1.0.0 (2026-01-10)

### Features

* add project infra and test suite ([e295aed](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/e295aed42ac6f3719ff66cdcbacadbae34dca613))
* implement server adapter with core functionality ([0141461](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/0141461d821e255a6497f67d3543f52b8bdf12ec))
* init project ([5b502e9](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/5b502e936121504e999f24e55f437bacae173170))
* migrate to semantic-release and update action versions ([827dfa0](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/827dfa055bb47c6d3409f60029a60aeadd38c746))

### Bug Fixes

* add conventional-changelog-conventionalcommits dependency ([a58c681](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/a58c681860cfcb69a68e477d574239b7e382402f))
* update lock file ([b9817a6](https://github.com/aymaneallaoui/elysia-mastra-adapter/commit/b9817a6e3d2a574d92779dd68d7979dc8975a496))

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-09

### Added

- Initial release of `elysia-mastra` adapter
- **ElysiaServer** class extending MastraServer for full control
  - Complete response handling for all types: `json`, `stream`, `datastream-response`, `mcp-http`, `mcp-sse`
  - Body size limit middleware with configurable max size and error handling
  - Request cancellation via AbortSignal connected to request lifecycle
  - Per-route authentication overrides via `customRouteAuthConfig` with wildcard support
  - Stream redaction for sensitive data
  - Comprehensive logging support via `MastraLogger` interface
  - OpenAPI spec generation at configurable endpoint
- **`mastra()` plugin** for automatic type inference
  - Use `.use(mastra({ mastra: instance }))` for automatic typing in route handlers
  - No need to manually type each handler with `ElysiaContext`
  - `withMastra()` alias available
- **Full type safety** with properly typed context
  - `ElysiaContext` type for manual typing when needed
  - `ElysiaWithMastra` type for typed Elysia app instances
  - `MastraDeriveContext`, `MastraAuthContext`, `MastraFullContext` for advanced use
- **SSE and ndjson streaming** with proper headers and completion markers
- **MCP transport support** for HTTP and SSE
- **Examples** demonstrating various use cases:
  - Basic setup with 3 approaches (plugin-only, ElysiaServer-only, hybrid)
  - Authentication with JWT and per-route overrides
  - Custom tools integration
  - Streaming responses (SSE, ndjson, WebSocket)
  - OpenAPI/Swagger integration
