import { useState } from "react";

const stages = ["Understand", "Expand", "Search", "Rank"];
const details = ["Interpreting the invention", "Building a concept map", "Finding publications", "Ordering relevance"];

export default function App() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(""); setSearch(null);
    try {
      const response = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Search failed.");
      setSearch(payload);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-stone-50 text-slate-900">
    <div className="mx-auto max-w-6xl px-6 py-7 sm:px-10">
      <header className="flex items-center border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2 font-serif text-2xl font-bold tracking-tight"><span className="grid size-7 place-items-center rounded-full bg-emerald-900 font-mono text-xs text-white">P</span>patent pal</div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500"><span className="size-2 rounded-full bg-emerald-500" />provider-ready</div>
      </header>
      <section className="py-16 sm:py-20">
        <p className="mb-3 font-mono text-xs tracking-[.14em] text-emerald-800">US PATENT INTELLIGENCE</p>
        <h1 className="max-w-2xl font-serif text-5xl font-semibold leading-[.98] tracking-tight sm:text-6xl">Find the prior art<br />that matters.</h1>
        <p className="mt-5 max-w-xl leading-7 text-slate-600">Ask in plain language. Your local search agent turns the question into a focused patent investigation.</p>
      </section>
      <form onSubmit={submit} className="border border-stone-300 bg-white p-5 shadow-[0_12px_30px_-20px_rgba(32,40,35,.45)] sm:p-6">
        <label htmlFor="query" className="mb-3 block text-sm font-semibold">What are you looking for?</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. battery cooling systems for electric aircraft" className="min-w-0 flex-1 border border-stone-300 px-4 py-3 outline-none ring-emerald-800 placeholder:text-stone-400 focus:ring-2" />
          <button disabled={loading} className="bg-emerald-900 px-5 py-3 font-medium text-white transition hover:bg-emerald-800 disabled:cursor-wait disabled:opacity-60">{loading ? "Searching…" : "Search patents →"}</button>
        </div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>Provider adapters keep the UI independent of the search source.</span><button type="button" onClick={() => setQuery("battery cooling systems for electric aircraft")} className="text-emerald-800 underline underline-offset-4">Try an example</button></div>
      </form>
      {error && <p role="alert" className="mt-6 border-l-2 border-rose-500 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
      {!search && !loading && !error && <div className="grid min-h-64 place-items-center py-12 text-center text-sm text-slate-500"><div><div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-stone-300 font-serif text-3xl text-emerald-800">⌕</div>Start with a technical problem, feature, or claim concept.</div></div>}
      {(loading || search) && <section className="mt-10 grid gap-10 lg:grid-cols-[12rem_1fr]">
        <aside><p className="text-sm font-semibold"><span className="mr-2 inline-block size-2 rounded-full bg-amber-500" />Search agent</p><ol className="mt-6 space-y-5">{stages.map((stage, index) => <li key={stage} className="flex gap-3"><span className="font-mono text-xs text-emerald-800">0{index + 1}</span><div><strong className="block text-sm">{stage}</strong><small className="text-xs text-slate-500">{details[index]}</small></div></li>)}</ol></aside>
        <div><div className="flex items-end justify-between"><div><p className="font-mono text-xs tracking-[.14em] text-emerald-800">SEARCH RESULTS</p><h2 className="mt-2 font-serif text-3xl font-semibold">Prior art for your concept</h2></div>{search && <span className="rounded-full bg-emerald-100 px-3 py-1 font-mono text-xs text-emerald-800">{search.provider}</span>}</div>
          {loading ? <p className="mt-6 border-l-2 border-amber-400 bg-amber-50 p-4 text-sm text-slate-600">Preparing a provider-neutral search request…</p> : <><p className="mt-6 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">{search.summary}</p><div className="mt-3">{search.results.map((result) => <article key={result.publicationNumber} className="relative border-t border-stone-200 py-5 last:border-b"><div className="mb-2 flex flex-wrap gap-2 font-mono text-[11px] tracking-wide text-emerald-800"><span>{result.publicationNumber}</span><span>•</span><span>{result.publicationDate} · {result.assignee}</span></div><div className="absolute right-0 top-5 text-right font-mono text-lg text-emerald-800">{result.relevance}%<span className="block font-sans text-[10px] uppercase text-slate-500">relevance</span></div><h3 className="max-w-[80%] text-lg font-semibold">{result.title}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{result.abstract}</p></article>)}</div></>}
        </div>
      </section>}
    </div>
  </main>;
}
