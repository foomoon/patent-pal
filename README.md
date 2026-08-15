# Patent Pal

Patent Pal is a Vite + React prototype for agent-assisted, US-focused patent search. It exposes one local API and keeps each patent source behind a provider adapter.

## Run locally

```sh
npm install
npm run dev
```

Open `http://localhost:5173` (Vite selects the next available port if needed). The default `mock` provider makes the interface usable before cloud configuration. Run `npm test` to verify the provider contract and `npm run build` for a production frontend build.

## Google BigQuery provider

1. Create a Google Cloud project and enable BigQuery.
2. Authenticate locally with `gcloud auth application-default login`.
3. Copy `.env.example` to `.env`, set `PATENT_PROVIDER=bigquery`, and add `GOOGLE_CLOUD_PROJECT`.
4. Restart `npm run dev`.

The provider searches US title and abstract fields in Google's public patent research table. By default, each query is capped at 1 GiB scanned; increase `PATENT_MAX_BYTES_BILLED` only intentionally. Credentials stay in the API process and never enter the Vite client.

## Adding a provider

Implement `search(query)` in `src/providers/` and return the normalized response used by `MockPatentProvider`. Register it in `src/providers/provider.js`. Provider-specific authentication, source schema, and query syntax must remain outside the React UI.
