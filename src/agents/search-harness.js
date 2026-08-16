import { randomUUID } from "node:crypto";
import { SearchCache, cacheKey, queryCacheKey } from "./search-cache.js";

export class PatentSearchHarness {
  constructor({ agent, provider, cache = new SearchCache(), maxIterations = 3, maxSessionBytesBilled = 70_000_000_000 }) {
    this.agent = agent;
    this.provider = provider;
    this.cache = cache;
    this.maxIterations = maxIterations;
    this.maxSessionBytesBilled = maxSessionBytesBilled;
    this.sessions = new Map();
  }

  start(query, { refresh = false } = {}) {
    const progress = { stage: "planning", message: "Understanding your question and building search terms." };
    const session = { id: randomUUID(), query, refresh, status: "running", startedAt: new Date().toISOString(), turns: [], results: [], usage: emptyUsage(), progress, progressHistory: [progress] };
    this.sessions.set(session.id, session);
    session.task = this.execute(session).catch((error) => {
      session.status = "error";
      session.error = error instanceof Error ? error.message : "Search failed.";
      session.completedAt = new Date().toISOString();
    });
    return this.toResponse(session);
  }

  async run(query, options) {
    const started = this.start(query, options);
    const session = this.sessions.get(started.sessionId);
    await session.task;
    if (session.status === "error") throw new Error(session.error);
    return this.toResponse(session);
  }

  async execute(session) {
    const { query } = session;
    const sessionKey = queryCacheKey(this.provider.name, query);
    if (!session.refresh) {
      const saved = await this.cache.get(sessionKey);
      if (saved) {
        session.reused = true;
        this.setProgress(session, { stage: "enriching", message: "Reusing saved results and checking source details." });
        session.turns = saved.value.turns || [];
        session.results = this.provider.hydrateResults ? await this.provider.hydrateResults(saved.value.results || []) : saved.value.results || [];
        session.status = "complete";
        session.completedAt = new Date().toISOString();
        this.setProgress(session, { stage: "complete", message: "Reused saved search results." });
        session.summary = "Reused saved results for this exact search. Select Refresh search to run a new investigation.";
        await this.cache.set(sessionKey, { turns: session.turns, results: session.results });
        return;
      }
    }
    let plan = await this.agent.plan(query);

    for (let iteration = 1; iteration <= this.maxIterations; iteration += 1) {
      const key = cacheKey(this.provider.name, plan.searchTerms);
      const cached = session.refresh ? null : await this.cache.get(key) || await this.cache.getPreviousVersion?.(key);
      this.setProgress(session, cached ? { stage: "searching", message: `Reusing a cached retrieval for research round ${iteration}.` } : { stage: "estimating", message: `Estimating BigQuery data use for research round ${iteration}.` });
      const projectedUsage = cached ? emptyUsage() : await this.estimateUsage(plan);
      if (session.usage.bytesBilled + projectedUsage.bytesBilled > this.maxSessionBytesBilled) {
        session.turns.push({ iteration, searchTerms: plan.searchTerms, rationale: plan.searchRationale, retrieved: 0, cached: false, decision: "finish", decisionRationale: "Stopped before exceeding the research-session data budget." });
        break;
      }
      this.setProgress(session, cached ? { stage: "enriching", message: `Enriching ${cached.value.results.length} cached publications with source details.` } : { stage: "searching", message: `Searching U.S. patent publications (round ${iteration}).` });
      let retrieval = cached?.value || await this.provider.search(plan, { onProgress: (progress) => this.setProgress(session, progress) });
      if (cached && this.provider.hydrateResults) retrieval = { ...retrieval, results: await this.provider.hydrateResults(retrieval.results) };
      if (!cached || retrieval !== cached.value) await this.cache.set(key, retrieval);
      session.results = mergeResults(session.results, retrieval.results);
      session.usage = addUsage(session.usage, cached ? emptyUsage() : retrieval.usage);
      const turn = { iteration, searchTerms: plan.searchTerms, rationale: plan.searchRationale, retrieved: retrieval.results.length, cached: Boolean(cached) };
      session.turns.push(turn);

      if (iteration === this.maxIterations) {
        turn.decision = "finish";
        turn.decisionRationale = "Maximum search iterations reached.";
        break;
      }

      this.setProgress(session, { stage: "reviewing", message: `Reviewing evidence from research round ${iteration}.` });
      const reflection = await this.agent.reflect({ query, plan, results: session.results, iteration });
      turn.decision = reflection.nextAction;
      turn.decisionRationale = reflection.rationale;
      if (reflection.nextAction !== "refine") break;
      plan = { query, searchTerms: reflection.searchTerms, searchRationale: reflection.rationale };
    }

    this.setProgress(session, { stage: "reranking", message: "Reranking the combined patent results." });
    session.results = await this.agent.rerank(query, session.results);
    session.status = "complete";
    session.completedAt = new Date().toISOString();
    this.setProgress(session, { stage: "complete", message: "Search complete." });
    await this.cache.set(sessionKey, { turns: session.turns, results: session.results });
  }

  async estimateUsage(plan) {
    return this.provider.estimateUsage ? this.provider.estimateUsage(plan) : emptyUsage();
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? this.toResponse(session) : null;
  }

  setProgress(session, progress) {
    session.progress = progress;
    if (session.progressHistory.at(-1)?.stage === progress.stage) session.progressHistory[session.progressHistory.length - 1] = progress;
    else session.progressHistory.push(progress);
  }

  toResponse(session) {
    return {
      sessionId: session.id,
      provider: this.provider.name,
      query: session.query,
      status: session.status,
      reused: Boolean(session.reused),
      progress: session.progress,
      progressHistory: session.progressHistory,
      error: session.error,
      summary: session.summary || (session.status === "complete" ? `Completed ${session.turns.length} research ${session.turns.length === 1 ? "round" : "rounds"}. ${session.turns.at(-1)?.decisionRationale || ""}`.trim() : session.progress.message),
      turns: session.turns,
      usage: session.usage,
      results: session.results
    };
  }
}

function emptyUsage() { return { bytesProcessed: 0, bytesBilled: 0, queryCount: 0 }; }
function addUsage(total, usage = emptyUsage()) { return { bytesProcessed: total.bytesProcessed + (usage.bytesProcessed || 0), bytesBilled: total.bytesBilled + (usage.bytesBilled || 0), queryCount: total.queryCount + (usage.queryCount || 0) }; }

function mergeResults(existing, incoming) {
  const byPublication = new Map(existing.map((result) => [result.publicationNumber, result]));
  for (const result of incoming) byPublication.set(result.publicationNumber, result);
  return [...byPublication.values()].slice(0, 30);
}
