# Patent Pal

Patent Pal is a Vite + React prototype for agent-assisted, US-focused patent search. It exposes one local API and keeps each patent source behind a provider adapter.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173` (Vite selects the next available port if needed). This application has no mock provider: searches require Google BigQuery and a local LM Studio model. Run `npm test` to verify integration-free behavior and `npm run build` for a production frontend build.

## Google BigQuery provider

1. Create a Google Cloud project, enable BigQuery, and authenticate locally with `gcloud auth application-default login`.
2. In LM Studio's Developer tab, start the local server and load the configured model.
3. Copy `.env.example` to `.env` and set `GOOGLE_CLOUD_PROJECT`.
4. Restart `npm run dev`.

The local LM Studio agent works through a bounded research loop: it expands the question into technical search phrases, retrieves US publication titles and Google's precomputed salient terms, inspects the evidence, and can refine the query before reranking the combined candidates. Results are cached locally in `.cache/` by normalized terms. The harness dry-runs uncached rounds and stops before its 70 GB session budget (`MAX_SESSION_BYTES_BILLED`) is exceeded. Credentials stay in the API process and never enter the Vite client.

Each search response includes a session ID and turn record. Fetch `GET /api/search/{sessionId}` to inspect a completed in-memory session. Sessions persist only while the local API process is running.

## Adding a provider

Implement `search(plan)` in `src/providers/` and return the normalized response shape. Register it in `src/providers/provider.js`. Provider-specific authentication, source schema, and query syntax must remain outside the React UI.
