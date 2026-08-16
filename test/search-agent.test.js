import test from "node:test";
import assert from "node:assert/strict";
import { applySourceTextGate, LMStudioSearchAgent, normalizeRanking, parseJson } from "../src/agents/lm-studio-agent.js";
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
  const agent = new LMStudioSearchAgent();
  agent.complete = async () => "I cannot rank these results.";
  const results = [{ title: "First", abstract: "A", relevance: 90 }, { title: "Second", abstract: "B", relevance: 80 }];
  const ranked = await agent.rerank("test", results);
  assert.deepEqual(ranked.map((result) => result.title), ["First", "Second"]);
  assert.deepEqual(ranked.map((result) => result.rank), [1, 2]);
});

test("reranking attaches the local model's final rank", async () => {
  const agent = new LMStudioSearchAgent();
  agent.complete = async () => '{"order":[1,0]}';
  const results = [{ title: "First", abstract: "A" }, { title: "Second", abstract: "B" }];
  const ranked = await agent.rerank("test", results);
  assert.equal(ranked[0].title, "Second");
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].rank, 2);
});

test("source-backed results are ranked above candidates without patent text", () => {
  const results = [{ title: "Source backed", sourceTextAvailable: true }, { title: "Metadata only", sourceTextAvailable: false }];
  assert.deepEqual(applySourceTextGate(results, [1, 0]).map((result) => result.title), ["Source backed", "Metadata only"]);
});
