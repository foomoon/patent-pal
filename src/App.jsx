import { useEffect, useRef, useState } from "react";

const stages = [{ key: "planning", label: "Understand", detail: "Interpreting the invention" }, { key: "estimating", label: "Estimate", detail: "Checking data use" }, { key: "searching", label: "Search", detail: "Finding publications" }, { key: "enriching", label: "Enrich", detail: "Loading source details" }, { key: "reviewing", label: "Review", detail: "Evaluating evidence" }, { key: "reranking", label: "Rank", detail: "Ordering relevance" }];

export default function App() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monthlyUsage, setMonthlyUsage] = useState(null);

  useEffect(() => {
    fetch("/api/usage").then((response) => response.ok ? response.json() : null).then(setMonthlyUsage).catch(() => setMonthlyUsage(null));
  }, []);

  async function submit(event) {
    event.preventDefault();
    await runSearch(false);
  }

  async function runSearch(refresh) {
    if (!query.trim()) return;
    setLoading(true); setError(""); setSearch(null);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, refresh }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed.");
      setSearch(payload);
      const completed = await waitForCompletion(payload.sessionId, setSearch);
      if (completed.status === "error") throw new Error(completed.error || "Search failed.");
      setMonthlyUsage((current) => current ? { ...current, bytesProcessed: current.bytesProcessed + completed.usage.bytesProcessed, bytesBilled: current.bytesBilled + completed.usage.bytesBilled, queryCount: current.queryCount + completed.usage.queryCount } : current);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <div className="mx-auto max-w-6xl px-6 py-7 sm:px-10">
      <header className="flex items-center border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2 text-xl font-bold tracking-tight"><span className="grid size-7 place-items-center rounded-md bg-indigo-600 font-mono text-xs text-white">P</span>patent pal</div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500"><span className="size-2 rounded-full bg-emerald-500" />{monthlyUsage ? `${formatTiB(monthlyUsage.bytesBilled)} TiB this month` : "usage loading…"}</div>
      </header>
      <section className="py-16 sm:py-20">
        <p className="mb-3 font-mono text-xs tracking-[.14em] text-indigo-600">US PATENT INTELLIGENCE</p>
        <h1 className="max-w-2xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">Find relevant<br />patents.</h1>
        <p className="mt-5 max-w-xl leading-7 text-slate-600">Ask in plain language. Your local search agent turns the question into a focused patent investigation.</p>
      </section>
      <form onSubmit={submit} className="border border-stone-300 bg-white p-5 shadow-[0_12px_30px_-20px_rgba(32,40,35,.45)] sm:p-6">
        <label htmlFor="query" className="mb-3 block text-sm font-semibold">What are you looking for?</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. battery cooling systems for electric aircraft" className="min-w-0 flex-1 border border-slate-300 px-4 py-3 outline-none ring-indigo-500 placeholder:text-slate-400 focus:ring-2" />
          <button disabled={loading} className="bg-indigo-600 px-5 py-3 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{loading ? "Searching…" : "Search patents →"}</button>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Repeated searches reuse saved results; refresh runs a new investigation.</span><div className="flex gap-3"><button type="button" onClick={() => setQuery("battery cooling systems for electric aircraft")} className="text-indigo-600 underline underline-offset-4">Try an example</button>{search && <button type="button" onClick={() => runSearch(true)} className="text-indigo-600 underline underline-offset-4">Refresh search</button>}</div></div>
      </form>
      {error && <p role="alert" className="mt-6 border-l-2 border-rose-500 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {!search && !loading && !error && <div className="grid min-h-64 place-items-center py-12 text-center text-sm text-slate-500"><div><div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-slate-300 text-3xl text-indigo-600">⌕</div>Start with a technical problem, feature, or claim concept.</div></div>}
      {(loading || search) && <section className="mt-10 grid gap-10 lg:grid-cols-[12rem_1fr]">
        <aside><p className="text-sm font-semibold"><span className="mr-2 inline-block size-2 rounded-full bg-indigo-500" />Search agent</p>{search?.reused ? <div className="mt-6 border-l-2 border-indigo-500 bg-indigo-50/70 p-4"><p className="font-mono text-xs tracking-wide text-indigo-600">SAVED SEARCH</p><strong className="mt-1 block text-sm">Reused saved results</strong><small className="mt-1 block text-xs leading-5 text-slate-500">Skipped a new model and BigQuery run; source details were refreshed.</small></div> : <ol className="mt-6 space-y-3">{stages.map((stage, index) => { const active = search?.progress?.stage === stage.key; const started = search?.progressHistory?.some((progress) => progress.stage === stage.key); return <li key={stage.key} className={`flex gap-3 border-l-2 py-1 pl-3 transition ${active ? "border-indigo-500 bg-indigo-50/70" : started ? "border-slate-300" : "border-transparent opacity-40"}`}><span className={`font-mono text-xs ${active ? "text-indigo-600" : started ? "text-slate-700" : "text-slate-400"}`}>0{index + 1}</span><div><strong className="block text-sm">{stage.label}</strong><small className="text-xs text-slate-500">{active ? search.progress.message : stage.detail}</small></div></li>; })}</ol>}</aside>
        <div><div className="flex items-end justify-between"><div><p className="font-mono text-xs tracking-[.14em] text-indigo-600">PATENT SEARCH RESULTS</p><h2 className="mt-2 text-3xl font-semibold">Relevant U.S. patent publications</h2></div>{search && <span className="rounded-full bg-indigo-50 px-3 py-1 font-mono text-xs text-indigo-700">{search.provider}</span>}</div>
          {loading ? <p className="mt-6 border-l-2 border-indigo-400 bg-indigo-50 p-4 text-sm text-slate-600">{search?.progress?.message || "Starting search…"}</p> : <><p className="mt-6 bg-indigo-50 p-4 text-sm leading-6 text-slate-700">{search.summary}</p><p className="mt-2 text-xs text-slate-500">Research session {search.sessionId.slice(0, 8)} · {search.turns.length} rounds · {formatGiB(search.usage.bytesBilled)} GiB billed</p><div className="mt-3">{search.results.map((result) => <ResultCard key={result.publicationNumber} result={result} />)}</div></>}
        </div>
      </section>}
    </div>
  </main>;
}

function ResultCard({ result }) {
  const cardRef = useRef(null);
  const [overview, setOverview] = useState("");
  const [overviewError, setOverviewError] = useState(false);

  useEffect(() => {
    if (result.abstract) return undefined;
    const controller = new AbortController();
    const loadOverview = async () => {
      try {
        const response = await fetch("/api/patent-overview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicationNumber: result.publicationNumber, title: result.title, salientTerms: result.salientTerms }), signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Overview unavailable.");
        setOverview(payload.overview);
      } catch (error) {
        if (error.name !== "AbortError") setOverviewError(true);
      }
    };
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) { observer.disconnect(); loadOverview(); } }, { rootMargin: "160px" });
    observer.observe(cardRef.current);
    return () => { controller.abort(); observer.disconnect(); };
  }, [result.abstract, result.publicationNumber, result.title, result.salientTerms]);

  return <article ref={cardRef} className="relative border-t border-slate-200 py-5 last:border-b"><div className="mb-2 flex flex-wrap gap-2 font-mono text-[11px] tracking-wide text-indigo-600"><span>{result.publicationNumber}</span><span>•</span><span>{result.publicationDate || "Publication date unavailable"} · {result.assignee}</span></div>{result.rank && <div className="absolute right-0 top-5 text-right font-mono text-lg text-indigo-600">#{result.rank}<span className="block font-sans text-[10px] uppercase text-slate-500">agent rank</span></div>}<h3 className="max-w-[80%] text-lg font-semibold"><a href={result.patentUrl} target="_blank" rel="noreferrer" className="underline decoration-indigo-200 underline-offset-4 hover:decoration-indigo-600">{result.title}</a></h3>{result.abstract ? <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{result.abstract}</p> : overview ? <><p className="mt-3 font-mono text-[10px] tracking-wide text-indigo-500">AI-GENERATED OVERVIEW</p><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{overview}</p></> : overviewError ? <p className="mt-2 max-w-2xl text-sm italic leading-6 text-slate-500">An overview could not be generated for this publication.</p> : <OverviewSkeleton />}{result.salientTerms?.length > 0 && <div className="mt-3 flex max-w-2xl flex-wrap gap-1.5">{result.salientTerms.map((term) => <span key={term} className="rounded-md border border-indigo-100 bg-slate-50 px-2 py-1 text-xs text-slate-500">{term}</span>)}</div>}{result.figures?.length > 0 && <div className="mt-4 flex gap-3 overflow-x-auto pb-1">{result.figures.map((figureUrl, index) => <a key={figureUrl} href={result.patentUrl} target="_blank" rel="noreferrer" className="shrink-0 border border-slate-200 bg-white p-1"><img src={figureUrl} loading="lazy" alt={`Figure ${index + 1} from ${result.title}`} className="h-28 w-36 object-contain" /></a>)}</div>}<a href={result.patentUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-medium text-indigo-600 underline underline-offset-4">View patent on Google Patents →</a></article>;
}

function OverviewSkeleton() {
  return <div className="mt-3 max-w-2xl animate-pulse space-y-2" aria-label="Generating AI overview"><span className="block h-3 w-full rounded bg-slate-200" /><span className="block h-3 w-5/6 rounded bg-slate-200" /><span className="block h-3 w-2/3 rounded bg-slate-200" /></div>;
}

async function waitForCompletion(sessionId, onUpdate) {
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const response = await fetch(`/api/search/${sessionId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Search session was unavailable.");
    onUpdate(payload);
    if (payload.status === "complete" || payload.status === "error") return payload;
  }
}

function formatGiB(bytes) { return (bytes / 1024 ** 3).toFixed(1); }
function formatTiB(bytes) { return (bytes / 1024 ** 4).toFixed(3); }
