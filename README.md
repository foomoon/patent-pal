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
2. Start a local model server. Ollama is the default: run `ollama serve`, then `ollama pull llama3.2`. LM Studio is also supported through its OpenAI-compatible server.
3. Copy `.env.example` to `.env` and set `GOOGLE_CLOUD_PROJECT`.
4. Restart `npm run dev`.

The local model agent works through a bounded research loop: it expands the question into technical search phrases, retrieves US publication titles and Google's precomputed salient terms, inspects the evidence, and can refine the query before reranking the combined candidates. Results are cached locally in `.cache/` by normalized terms. The harness dry-runs uncached rounds and stops before its 70 GB session budget (`MAX_SESSION_BYTES_BILLED`) is exceeded. Credentials stay in the API process and never enter the Vite client.

## Local model configuration

Ollama is the default configuration in `.env.example` and uses its native chat API. To use LM Studio or another OpenAI-compatible local server instead, set:

```sh
LOCAL_MODEL_PROVIDER=openai-compatible
LOCAL_MODEL_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_MODEL_MODEL=openai/gpt-oss-20b
```

Each search response includes a session ID and turn record. Fetch `GET /api/search/{sessionId}` to inspect a completed in-memory session. Sessions persist only while the local API process is running.

## Adding a provider

Implement `search(plan)` in `src/providers/` and return the normalized response shape. Register it in `src/providers/provider.js`. Provider-specific authentication, source schema, and query syntax must remain outside the React UI.
