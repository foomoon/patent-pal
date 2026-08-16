import test from "node:test";
import assert from "node:assert/strict";
import { PatentSearchHarness } from "../src/agents/search-harness.js";

test("harness refines once, records turns, and reranks the combined evidence", async () => {
  const calls = [];
  const agent = {
    async plan(query) { return { query, searchTerms: ["thermal battery"], searchRationale: "Start with the core system." }; },
    async reflect({ iteration }) { return iteration === 1 ? { nextAction: "refine", searchTerms: ["dielectric cooling loop"], rationale: "Add the cooling-medium concept." } : { nextAction: "finish", searchTerms: [], rationale: "Enough evidence." }; },
    async rerank(query, results) { return [...results].reverse(); }
  };
  const provider = {
    name: "test-provider",
    async search(plan) { calls.push(plan.searchTerms); return { results: [{ publicationNumber: `US-${calls.length}`, title: "Test", abstract: "Evidence", relevance: 50 }] }; }
  };
  const response = await new PatentSearchHarness({ agent, provider, cache: memoryCache(), maxIterations: 3 }).run("battery cooling");
  assert.deepEqual(calls, [["thermal battery"], ["dielectric cooling loop"]]);
  assert.equal(response.turns.length, 2);
  assert.equal(response.turns[0].decision, "refine");
  assert.equal(response.turns[1].decision, "finish");
  assert.equal(response.results[0].publicationNumber, "US-2");
});

test("harness exposes planning status while an asynchronous search is running", async () => {
  let releasePlan;
  const planReady = new Promise((resolve) => { releasePlan = resolve; });
  const agent = { async plan() { await planReady; return { searchTerms: ["battery cooling"], searchRationale: "Core terms." }; }, async rerank(query, results) { return results; } };
  const provider = { name: "test-provider", async search() { return { results: [] }; } };
  const harness = new PatentSearchHarness({ agent, provider, cache: memoryCache(), maxIterations: 1 });
  const started = harness.start("battery cooling");
  assert.equal(started.status, "running");
  assert.equal(started.progress.stage, "planning");
  releasePlan();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.get(started.sessionId).status, "complete");
});

test("harness reuses a repeated query without adding billed usage", async () => {
  let searches = 0;
  const agent = { async plan() { return { searchTerms: ["battery cooling"], searchRationale: "Core terms." }; }, async rerank(query, results) { return results; } };
  const provider = { name: "test-provider", async estimateUsage() { return { bytesBilled: 20 }; }, async search() { searches += 1; return { results: [{ publicationNumber: "US-1" }], usage: { bytesBilled: 20 } }; } };
  const cache = memoryCache();
  const harness = new PatentSearchHarness({ agent, provider, cache, maxIterations: 1, maxSessionBytesBilled: 30 });
  await harness.run("battery cooling");
  const second = await harness.run("battery cooling");
  assert.equal(searches, 1);
  assert.equal(second.usage.bytesBilled, 0);
  assert.match(second.summary, /Reused saved results/);
});

test("harness upgrades an earlier cache entry without rerunning the provider search", async () => {
  let searches = 0;
  const agent = { async plan() { return { searchTerms: ["battery cooling"], searchRationale: "Core terms." }; }, async rerank(query, results) { return results; } };
  const provider = { name: "test-provider", async search() { searches += 1; return { results: [] }; }, async hydrateResults(results) { return results.map((result) => ({ ...result, figures: ["figure.png"] })); } };
  const cache = { async get() { return null; }, async getPreviousVersion() { return { value: { results: [{ publicationNumber: "US-1" }] } }; }, async set(key, value) { this.value = value; } };
  const response = await new PatentSearchHarness({ agent, provider, cache, maxIterations: 1 }).run("battery cooling");
  assert.equal(searches, 0);
  assert.deepEqual(response.results[0].figures, ["figure.png"]);
  assert.deepEqual(cache.value.results[0].figures, ["figure.png"]);
});

test("harness reuses a completed search for the same user query before planning", async () => {
  let plans = 0;
  const agent = { async plan() { plans += 1; return { searchTerms: ["battery cooling"], searchRationale: "Core terms." }; }, async rerank(query, results) { return results; } };
  const provider = { name: "query-cache-provider", async search() { return { results: [] }; } };
  const cache = { async get(key) { return key.startsWith("session-v1:") ? { value: { turns: [{ iteration: 1 }], results: [{ publicationNumber: "US-1" }] } } : null; }, async set() {} };
  const response = await new PatentSearchHarness({ agent, provider, cache }).run("battery cooling");
  assert.equal(plans, 0);
  assert.equal(response.reused, true);
  assert.equal(response.results[0].publicationNumber, "US-1");
  assert.match(response.summary, /Reused saved results/);
});

test("harness stops before an uncached round exceeds the session budget", async () => {
  let searches = 0;
  const agent = { async plan() { return { searchTerms: ["battery cooling"], searchRationale: "Core terms." }; }, async rerank(query, results) { return results; } };
  const provider = { name: "budget-provider", async estimateUsage() { return { bytesBilled: 80 }; }, async search() { searches += 1; return { results: [] }; } };
  const response = await new PatentSearchHarness({ agent, provider, cache: memoryCache(), maxSessionBytesBilled: 70 }).run("battery cooling");
  assert.equal(searches, 0);
  assert.equal(response.turns[0].decision, "finish");
  assert.match(response.turns[0].decisionRationale, /data budget/);
});

function memoryCache() {
  const entries = new Map();
  return { async get(key) { return entries.get(key) || null; }, async set(key, value) { entries.set(key, { value }); } };
}
