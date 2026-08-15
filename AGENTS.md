# Repository Guidelines

## Project Structure & Module Organization

The Vite client is in `src/` (`App.jsx`, `main.jsx`, `index.css`). The local API is `src/server.js`, while source-specific adapters belong in `src/providers/`. Put contract tests in `test/`. Keep generated files, local caches, and secrets out of version control.

## Build, Test, and Development Commands

Run commands from the repository root:

- `npm install`: install dependencies.
- `npm run dev`: run the Vite client and local API with watching.
- `npm run build`: build the client for production.
- `npm test`: run the Node test suite.

Do not add a toolchain without documenting its version and setup steps.

## Coding Style & Naming Conventions

Use 2 spaces for JSON and JavaScript. Use `camelCase` for variables/functions, `PascalCase` for React components and classes, and lowercase kebab-case filenames such as `bigquery-provider.js`. Provider adapters must return the same normalized response shape, regardless of source.

## Testing Guidelines

Add or update tests with behavior changes and bug fixes. Name test files after the unit under test (for example, `providers.test.js`) and describe observable behavior, not implementation details. Tests must be deterministic: avoid live network calls, real credentials, and time-dependent assertions. Run `npm test` before opening a pull request.

## Commit & Pull Request Guidelines

There is no Git history yet, so use concise imperative commit subjects: `Add patent query validation` or `Fix claim parser timeout`. Keep commits small and single-purpose. Pull requests should explain the problem and solution, link related issues, list test commands run, and include screenshots for user-interface changes. Call out configuration, migration, security, or compatibility impacts explicitly.

## Security & Configuration

Store credentials only in local environment files such as `.env`; commit a sanitized `.env.example` when configuration is needed. Never commit API keys, client data, or proprietary patent documents. Validate external input and document required environment variables.
