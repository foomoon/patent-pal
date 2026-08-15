import { createServer } from "node:http";
import { createPatentProvider } from "./providers/provider.js";

const provider = createPatentProvider(process.env.PATENT_PROVIDER, { projectId: process.env.GOOGLE_CLOUD_PROJECT, maximumBytesBilled: process.env.PATENT_MAX_BYTES_BILLED });
const port = Number(process.env.API_PORT || 3021);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/api/search") return respond(response, 404, { error: "Not found." });
  try {
    const body = await readJson(request);
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) return respond(response, 400, { error: "A patent query is required." });
    return respond(response, 200, await provider.search(query));
  } catch (error) {
    console.error(error);
    return respond(response, 500, { error: error.message || "Search failed." });
  }
}).listen(port, () => console.log(`Patent Pal API is running at http://localhost:${port} with ${provider.name}.`));

async function readJson(request) { let data = ""; for await (const chunk of request) data += chunk; return JSON.parse(data || "{}"); }
function respond(response, status, payload) { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(payload)); }
