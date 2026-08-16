import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cachePath = fileURLToPath(new URL("../../.cache/patent-pal-searches.json", import.meta.url));

export class SearchCache {
  async get(key) {
    const entries = await readEntries();
    return entries[key] || null;
  }

  async getPreviousVersion(key) {
    const entries = await readEntries();
    return entries[key.replace(/^v\d+:/, "v4:")] || null;
  }

  async set(key, value) {
    const entries = await readEntries();
    entries[key] = { cachedAt: new Date().toISOString(), value };
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify(entries, null, 2));
  }
}

async function readEntries() {
  try { return JSON.parse(await readFile(cachePath, "utf8")); }
  catch { return {}; }
}

export function cacheKey(providerName, searchTerms) {
  return `v5:${providerName}:${searchTerms.map((term) => term.toLowerCase().trim()).sort().join("|")}`;
}

export function queryCacheKey(providerName, query) {
  return `session-v1:${providerName}:${query.toLowerCase().trim().replace(/\s+/g, " ")}`;
}
