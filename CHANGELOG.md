# Changelog

All notable changes to this project will be documented in this file.

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
