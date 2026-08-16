import { createServer } from "node:http";
import { LocalModelSearchAgent } from "./agents/local-model-agent.js";
import { PatentSearchHarness } from "./agents/search-harness.js";
import { createPatentProvider } from "./providers/provider.js";

const provider = createPatentProvider(process.env.PATENT_PROVIDER || "bigquery", { projectId: process.env.GOOGLE_CLOUD_PROJECT, maximumBytesBilled: process.env.PATENT_MAX_BYTES_BILLED, fetchAbstracts: process.env.PATENT_ABSTRACT_ENRICHMENT !== "false" });
const agent = new LocalModelSearchAgent({ provider: process.env.LOCAL_MODEL_PROVIDER, baseUrl: process.env.LOCAL_MODEL_BASE_URL, model: process.env.LOCAL_MODEL_MODEL });
const harness = new PatentSearchHarness({ agent, provider, maxIterations: Number(process.env.MAX_SEARCH_ITERATIONS || 3), maxSessionBytesBilled: Number(process.env.MAX_SESSION_BYTES_BILLED || 70_000_000_000) });
const port = Number(process.env.API_PORT || 3021);

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url.startsWith("/api/search/")) {
      const session = harness.get(request.url.split("/").at(-1));
      return session ? respond(response, 200, session) : respond(response, 404, { error: "Search session not found." });
    }
    if (request.method === "GET" && request.url === "/api/usage") {
      return respond(response, 200, await provider.getMonthlyUsage());
    }
    if (request.method === "POST" && request.url === "/api/patent-overview") {
      const body = await readJson(request);
      const publicationNumber = typeof body.publicationNumber === "string" ? body.publicationNumber : "";
      if (!publicationNumber) return respond(response, 400, { error: "A publication number is required." });
      const key = `overview-v1:${publicationNumber}`;
      const cached = await harness.cache.get(key);
      if (cached) return respond(response, 200, cached.value);
      if (!provider.getPatentText) return respond(response, 501, { error: "This provider cannot retrieve patent text." });
      const overview = await agent.overview({ title: String(body.title || ""), salientTerms: Array.isArray(body.salientTerms) ? body.salientTerms.map(String).slice(0, 8) : [], patentText: await provider.getPatentText(publicationNumber) });
      const payload = { overview, generated: true };
      await harness.cache.set(key, payload);
      return respond(response, 200, payload);
    }
    if (request.method !== "POST" || request.url !== "/api/search") return respond(response, 404, { error: "Not found." });
    const body = await readJson(request);
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return respond(response, 400, { error: "A patent query is required." });
    return respond(response, 202, harness.start(query, { refresh: body.refresh === true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed.";
    console.error(`Search failed: ${message}`);
    return respond(response, 500, { error: message });
  }
}).listen(port, () => console.log(`Patent Pal API is running at http://localhost:${port} with ${provider.name}.`));

async function readJson(request) { let data = ""; for await (const chunk of request) data += chunk; return JSON.parse(data || "{}"); }
function respond(response, status, payload) { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(payload)); }
