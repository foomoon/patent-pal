const patentsTable = "patents-public-data.google_patents_research.publications";

export class BigQueryPatentProvider {
  name = "bigquery";

  constructor({ projectId, maximumBytesBilled, fetchAbstracts = true } = {}) {
    this.projectId = projectId;
    this.maximumBytesBilled = Number(maximumBytesBilled || 150_000_000_000);
    this.fetchAbstracts = fetchAbstracts;
  }

  async search(plan) {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery({ projectId: this.projectId });
    const [job] = await client.createQueryJob(this.queryOptions(plan));
    const [rows] = await job.getQueryResults();
    const [metadata] = await job.getMetadata();
    const results = rows.map((row) => ({
      publicationNumber: row.publication_number,
      publicationDate: "Date unavailable",
      assignee: "Google Patents Public Data",
      title: row.title || "Untitled publication",
      abstract: "",
      salientTerms: (row.top_terms || []).slice(0, 6),
      patentUrl: patentUrl(row.publication_number),
      matchScore: Number(row.match_score || 0),
      matchEvidence: formatEvidence(row)
    }));
    return {
      provider: this.name,
      query: plan.query,
      summary: `The local agent expanded your question into: ${plan.searchTerms.join(", ")}. Google Patents Public Datasets returned ${rows.length} US publications.`,
      usage: queryUsage(metadata),
      results: await this.hydrateResults(results)
    };
  }

  async hydrateResults(results) {
    const normalized = results.map((result) => ({ ...result, abstract: removeSalientTermPreamble(result.abstract), salientTerms: result.salientTerms?.length ? result.salientTerms : extractFallbackSalientTerms(result.abstract), patentUrl: result.patentUrl || patentUrl(result.publicationNumber) }));
    const hydrated = this.fetchAbstracts ? await enrichPatentDetails(normalized) : normalized;
    return hydrated.map(withDerivedSalientTerms);
  }

  async getPatentText(publicationNumber) {
    const response = await fetch(patentUrl(publicationNumber), { headers: { "User-Agent": "Patent Pal local research app" }, signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return "";
    return extractPatentText(await response.text());
  }

  async estimateUsage(plan) {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery({ projectId: this.projectId });
    const [job] = await client.createQueryJob({ ...this.queryOptions(plan), dryRun: true });
    const usage = queryUsage(job.metadata);
    // BigQuery dry runs report bytes processed, not a billed amount. Use that
    // estimate so the harness can apply its pre-flight session budget.
    return { ...usage, bytesBilled: usage.bytesBilled || usage.bytesProcessed };
  }

  async getMonthlyUsage() {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const client = new BigQuery({ projectId: this.projectId });
    const [rows] = await client.query({
      query: `SELECT COALESCE(SUM(total_bytes_processed), 0) AS bytes_processed, COALESCE(SUM(total_bytes_billed), 0) AS bytes_billed, COUNT(*) AS query_count FROM \`${this.projectId}.region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT\` WHERE creation_time >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH) AND job_type = 'QUERY' AND statement_type != 'SCRIPT' AND error_result IS NULL`,
      location: "US"
    });
    return { bytesProcessed: Number(rows[0]?.bytes_processed || 0), bytesBilled: Number(rows[0]?.bytes_billed || 0), queryCount: Number(rows[0]?.query_count || 0) };
  }

  queryOptions(plan) {
    const queryTerms = toSearchTokens([plan.query]);
    const anchors = toSearchTokens([plan.query], { excludeBroadTerms: true });
    const requiredAnchors = anchors.length ? anchors : queryTerms;
    const modifiers = queryTerms.filter((term) => !requiredAnchors.includes(term));
    const terms = [...new Set([...toSearchTokens(plan.searchTerms), ...queryTerms])];
    return {
      query: `WITH publications AS (SELECT publication_number, title, top_terms, LOWER(title) AS title_text, LOWER(ARRAY_TO_STRING(top_terms, ' ')) AS salient_text FROM \`${patentsTable}\` WHERE country = 'United States'), scored AS (SELECT publication_number, title, top_terms, (SELECT ARRAY_AGG(DISTINCT term) FROM UNNEST(@terms) AS term WHERE title_text LIKE CONCAT('%', REGEXP_REPLACE(term, r'(ing|ed)$', ''), '%')) AS title_terms, (SELECT ARRAY_AGG(DISTINCT term) FROM UNNEST(@terms) AS term WHERE salient_text LIKE CONCAT('%', REGEXP_REPLACE(term, r'(ing|ed)$', ''), '%')) AS salient_terms, (SELECT ARRAY_AGG(DISTINCT anchor) FROM UNNEST(@anchors) AS anchor WHERE title_text LIKE CONCAT('%', REGEXP_REPLACE(anchor, r'(ing|ed)$', ''), '%') OR salient_text LIKE CONCAT('%', REGEXP_REPLACE(anchor, r'(ing|ed)$', ''), '%')) AS anchor_terms, (SELECT ARRAY_AGG(DISTINCT modifier) FROM UNNEST(@modifiers) AS modifier WHERE title_text LIKE CONCAT('%', REGEXP_REPLACE(modifier, r'(ing|ed)$', ''), '%')) AS title_modifier_terms, (SELECT ARRAY_AGG(DISTINCT modifier) FROM UNNEST(@modifiers) AS modifier WHERE salient_text LIKE CONCAT('%', REGEXP_REPLACE(modifier, r'(ing|ed)$', ''), '%')) AS salient_modifier_terms FROM publications) SELECT publication_number, title, top_terms, title_terms, salient_terms, title_modifier_terms, salient_modifier_terms, COALESCE(ARRAY_LENGTH(title_terms), 0) * 4 + COALESCE(ARRAY_LENGTH(salient_terms), 0) + COALESCE(ARRAY_LENGTH(title_modifier_terms), 0) * 6 + COALESCE(ARRAY_LENGTH(salient_modifier_terms), 0) * 2 AS match_score FROM scored WHERE COALESCE(ARRAY_LENGTH(title_terms), 0) + COALESCE(ARRAY_LENGTH(salient_terms), 0) > 0 AND COALESCE(ARRAY_LENGTH(anchor_terms), 0) >= @minimumAnchorMatches ORDER BY match_score DESC, ARRAY_LENGTH(title_modifier_terms) DESC, ARRAY_LENGTH(title_terms) DESC LIMIT @limit`,
      location: "US",
      params: { terms, anchors: requiredAnchors, modifiers, minimumAnchorMatches: Math.min(2, requiredAnchors.length), limit: 15 },
      maximumBytesBilled: this.maximumBytesBilled,
      labels: { application: "patent_pal", workload: "search" }
    };
  }
}

async function enrichPatentDetails(results) {
  return Promise.all(results.map(async (result) => {
    try {
      const response = await fetch(result.patentUrl, { headers: { "User-Agent": "Patent Pal local research app" }, signal: AbortSignal.timeout(5_000) });
      if (!response.ok) return result;
      const html = await response.text();
      const abstract = extractPatentAbstract(html);
      const patentText = extractPatentText(html);
      return { ...result, abstract: abstract || result.abstract, figures: extractPatentFigures(html), sourceTextAvailable: Boolean(abstract || patentText) };
    } catch {
      return { ...result, sourceTextAvailable: false };
    }
  }));
}

function toSearchTokens(searchTerms, { excludeBroadTerms = false } = {}) {
  const ignored = new Set(["and", "the", "for", "from", "with", "system", "systems", "method", "methods", "device", "devices", "management", "material", "change", "pack"]);
  if (excludeBroadTerms) for (const term of ["integrated", "electric", "vehicle", "mount", "mounted", "mounting", "flush", "inlay", "assembly", "component", "structure", "apparatus"]) ignored.add(term);
  const tokens = searchTerms.flatMap((term) => term.toLowerCase().match(/[a-z0-9-]+/g) || []);
  return [...new Set(tokens.filter((token) => token.length > 2 && !ignored.has(token)))].slice(0, 15);
}

function formatEvidence(row) {
  const sections = [];
  if (row.title_terms?.length) sections.push(`Title matches: ${row.title_terms.join(", ")}`);
  if (row.salient_terms?.length) sections.push(`Salient-term matches: ${row.salient_terms.join(", ")}`);
  if (row.title_modifier_terms?.length) sections.push(`Specific title matches: ${row.title_modifier_terms.join(", ")}`);
  if (row.salient_modifier_terms?.length) sections.push(`Specific salient-term matches: ${row.salient_modifier_terms.join(", ")}`);
  return sections.join(" · ") || "No matching terms recorded.";
}

export function patentUrl(publicationNumber) {
  return `https://patents.google.com/patent/${String(publicationNumber).replace(/-/g, "")}/en`;
}

export function extractPatentAbstract(html) {
  const match = html.match(/<meta\s+name=["']DC\.description["']\s+content=["']([\s\S]*?)["']/i) || html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
  if (!match) return "";
  return decodeHtml(match[1]).replace(/\s+/g, " ").trim().slice(0, 700);
}

export function extractFallbackSalientTerms(value) {
  const match = typeof value === "string" && value.match(/^Salient terms:\s*(.*?)\.?$/i);
  return match ? match[1].split(",").map((term) => term.trim()).filter(Boolean).slice(0, 6) : [];
}

function removeSalientTermPreamble(value) {
  return extractFallbackSalientTerms(value).length ? "" : value;
}

function withDerivedSalientTerms(result) {
  return result.salientTerms?.length ? result : { ...result, salientTerms: deriveTerms(`${result.title || ""} ${result.abstract || ""}`) };
}

export function deriveTerms(value) {
  const ignored = new Set(["about", "after", "along", "also", "and", "are", "assembly", "between", "bridge", "comprises", "connected", "each", "electric", "from", "guitar", "having", "includes", "into", "method", "more", "mounting", "patent", "plurality", "provides", "system", "that", "thereof", "through", "with"]);
  const counts = new Map();
  for (const term of value.toLowerCase().match(/[a-z]{4,}/g) || []) if (!ignored.has(term)) counts.set(term, (counts.get(term) || 0) + 1);
  return [...counts.entries()].sort(([, left], [, right]) => right - left).map(([term]) => term).slice(0, 6);
}

export function extractPatentFigures(html) {
  const figures = [];
  const thumbnailPattern = /<img\s+itemprop=["']thumbnail["']\s+src=["']([^"']+)["']/gi;
  for (const match of html.matchAll(thumbnailPattern)) {
    const thumbnailUrl = decodeHtml(match[1]);
    if (thumbnailUrl.startsWith("https://patentimages.storage.googleapis.com/") && !figures.includes(thumbnailUrl)) figures.push(thumbnailUrl);
    if (figures.length === 2) break;
  }
  return figures;
}

export function extractPatentText(html) {
  const paragraphs = [];
  const pattern = /<(?:heading|div[^>]*class=["'][^"']*description-paragraph[^"']*["'][^>]*)>([\s\S]*?)<\/(?:heading|div)>/gi;
  for (const match of html.matchAll(pattern)) {
    const text = decodeHtml(match[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
    if (paragraphs.join(" ").length >= 6_000) break;
  }
  return paragraphs.join(" ").slice(0, 6_000);
}

function decodeHtml(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function queryUsage(metadata) {
  const query = metadata.statistics?.query || {};
  return { bytesProcessed: Number(query.totalBytesProcessed || 0), bytesBilled: Number(query.totalBytesBilled || 0), queryCount: 1 };
}
