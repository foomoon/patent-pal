const defaultBaseUrl = "http://127.0.0.1:1234/v1";

export class LMStudioSearchAgent {
  constructor({ baseUrl = defaultBaseUrl, model = "openai/gpt-oss-20b" } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
  }

  async plan(query) {
    const response = await this.complete(`You are a US patent-search planner. Return JSON only, without markdown. Given the user's question, create 3 to 6 concise technical search phrases appropriate for title and abstract search. Do not use broad filler words. Schema: {"searchTerms":["phrase"],"searchRationale":"one short sentence"}. User question: ${query}`);
    const plan = parseJson(response);
    if (!Array.isArray(plan.searchTerms) || plan.searchTerms.length < 1) throw new Error("The local model did not return usable search terms.");
    return { query, searchTerms: plan.searchTerms.slice(0, 6).map(String).filter(Boolean), searchRationale: String(plan.searchRationale || "") };
  }

  async rerank(query, results) {
    if (results.length < 2) return results;
    const candidates = results.map((result, index) => ({ index, title: result.title, abstract: String(result.abstract || "").slice(0, 500), salientTerms: result.salientTerms || [], sourceTextAvailable: result.sourceTextAvailable !== false }));
    try {
      const response = await this.complete(`You are ranking US patent search results for this question: ${query}. Return JSON only: {"order":[every zero-based candidate index exactly once, from most to least relevant]}. Do not omit, repeat, or invent indexes. Prefer candidates with sourceTextAvailable=true. Candidates without source text must rank below all source-backed candidates. Candidates: ${JSON.stringify(candidates)}`);
      const order = normalizeRanking(parseJson(response).order, results.length);
      return applySourceTextGate(results, order);
    } catch {
      // Retrieval is already ordered by provider relevance. A local-model
      // formatting error should not discard an otherwise useful search.
      return applySourceTextGate(results, results.map((_, index) => index));
    }
  }

  async reflect({ query, plan, results, iteration }) {
    const evidence = results.slice(0, 12).map((result) => ({ title: result.title, abstract: result.abstract.slice(0, 350) }));
    const response = await this.complete(`You are an iterative US patent-search researcher. Inspect the current retrieval evidence for the question and decide if another targeted title/abstract search is useful. Return JSON only. Schema: {"nextAction":"refine"|"finish","searchTerms":["3 to 6 phrases only if refining"],"rationale":"one concise sentence"}. Question: ${query}. Iteration: ${iteration}. Current terms: ${JSON.stringify(plan.searchTerms)}. Evidence: ${JSON.stringify(evidence)}`);
    const reflection = parseJson(response);
    if (!["refine", "finish"].includes(reflection.nextAction)) throw new Error("The local model did not return a valid research decision.");
    if (reflection.nextAction === "refine" && (!Array.isArray(reflection.searchTerms) || reflection.searchTerms.length < 1)) throw new Error("The local model requested refinement without usable search terms.");
    return {
      nextAction: reflection.nextAction,
      searchTerms: reflection.nextAction === "refine" ? reflection.searchTerms.slice(0, 6).map(String).filter(Boolean) : [],
      rationale: String(reflection.rationale || "The current evidence is sufficient.")
    };
  }

  async overview({ title, salientTerms, patentText }) {
    const response = await this.complete(`Write a factual one- or two-sentence overview of this US patent publication. Use only the supplied source text and metadata. Do not claim legal conclusions or invent details. Return JSON only: {"overview":"..."}. Title: ${title}. Key terms: ${JSON.stringify(salientTerms)}. Source text: ${(patentText || "No description text was available.").slice(0, 6000)}`);
    const overview = String(parseJson(response).overview || "").trim();
    if (!overview) throw new Error("The local model did not return a patent overview.");
    return overview.slice(0, 700);
  }

  async complete(prompt) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: this.model, messages: [{ role: "system", content: "Follow the requested JSON schema exactly." }, { role: "user", content: prompt }], temperature: 0.1, stream: false }) });
    } catch {
      throw new Error(`Cannot reach LM Studio at ${this.baseUrl}. Start its local server and verify LM_STUDIO_BASE_URL.`);
    }
    if (!response.ok) throw new Error(`LM Studio failed with HTTP ${response.status}. Verify LM_STUDIO_MODEL.`);
    const payload = await response.json();
    return payload.choices?.[0]?.message?.content;
  }
}

export function parseJson(value) {
  if (typeof value !== "string") throw new Error("The local model returned an empty response.");
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The local model did not return JSON.");
  return JSON.parse(match[0]);
}

export function normalizeRanking(order, resultCount) {
  const validIndexes = Array.isArray(order) ? order.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < resultCount) : [];
  const uniqueIndexes = [...new Set(validIndexes)];
  return [...uniqueIndexes, ...Array.from({ length: resultCount }, (_, index) => index).filter((index) => !uniqueIndexes.includes(index))];
}

export function applySourceTextGate(results, order) {
  const sourceBacked = order.filter((index) => results[index].sourceTextAvailable !== false);
  const unsupported = order.filter((index) => results[index].sourceTextAvailable === false);
  return [...sourceBacked, ...unsupported].map((index, rank) => ({ ...results[index], rank: rank + 1 }));
}
