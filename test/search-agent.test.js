import test from "node:test";
import assert from "node:assert/strict";
import { applySourceTextGate, LocalModelSearchAgent, normalizeRanking, parseJson } from "../src/agents/local-model-agent.js";
import { createPatentProvider } from "../src/providers/provider.js";

test("search agent parser accepts JSON returned with surrounding text", () => {
  assert.deepEqual(parseJson('Here is the plan: {"searchTerms":["battery cooling"]}'), { searchTerms: ["battery cooling"] });
});

test("search agent parser rejects an empty model response", () => {
  assert.throws(() => parseJson("No structured response"), /did not return JSON/);
});

test("unknown providers are rejected at startup", () => {
  assert.throws(() => createPatentProvider("unknown"), /Unknown patent provider/);
});

test("ranking normalization removes duplicates and appends omitted candidates", () => {
  assert.deepEqual(normalizeRanking(["1", 1, 0, 99], 3), [1, 0, 2]);
});

test("reranking falls back to provider order when the local model returns no JSON", async () => {
  const agent = new LocalModelSearchAgent();
  agent.complete = async () => "I cannot rank these results.";
  const results = [{ title: "First", abstract: "A", relevance: 90 }, { title: "Second", abstract: "B", relevance: 80 }];
  const ranked = await agent.rerank("test", results);
  assert.deepEqual(ranked.map((result) => result.title), ["First", "Second"]);
  assert.deepEqual(ranked.map((result) => result.rank), [1, 2]);
});

test("reranking attaches the local model's final rank", async () => {
  const agent = new LocalModelSearchAgent();
  agent.complete = async () => '{"order":[1,0]}';
  const results = [{ title: "First", abstract: "A" }, { title: "Second", abstract: "B" }];
  const ranked = await agent.rerank("test", results);
  assert.equal(ranked[0].title, "Second");
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 2);
});

test("Ollama uses its native chat API and reads the response content", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, async json() { return { message: { content: '{"searchTerms":["battery cooling"],"searchRationale":"Specific thermal-management terms."}' } }; } };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const agent = new LocalModelSearchAgent({ provider: "ollama", baseUrl: "http://localhost:11434/", model: "llama3.2" });
  const plan = await agent.plan("How are batteries cooled?");

  assert.equal(request.url, "http://localhost:11434/api/chat");
  const payload = JSON.parse(request.options.body);
  assert.equal(payload.model, "llama3.2");
  assert.equal(payload.messages[0].content, "Follow the requested JSON schema exactly.");
  assert.match(payload.messages[1].content, /batteries/i);
  assert.equal(payload.stream, false);
  assert.equal(payload.format, "json");
  assert.deepEqual(payload.options, { temperature: 0.1 });
  assert.deepEqual(plan.searchTerms, ["battery cooling"]);
});

test("OpenAI-compatible local servers retain the chat-completions contract", async (t) => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, async json() { return { choices: [{ message: { content: '{"searchTerms":["battery cooling"],"searchRationale":"Specific thermal-management terms."}' } }] }; } };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const agent = new LocalModelSearchAgent({ provider: "openai-compatible", baseUrl: "http://localhost:1234/v1/", model: "model" });
  await agent.plan("How are batteries cooled?");

  assert.equal(request.url, "http://localhost:1234/v1/chat/completions");
  assert.equal(JSON.parse(request.options.body).format, undefined);
});

test("source-backed results are ranked above candidates without patent text", () => {
  const results = [{ title: "Source backed", sourceTextAvailable: true }, { title: "Metadata only", sourceTextAvailable: false }];
  assert.deepEqual(applySourceTextGate(results, [1, 0]).map((result) => result.title), ["Source backed", "Metadata only"]);
});
