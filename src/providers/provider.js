import { BigQueryPatentProvider } from "./bigquery-provider.js";

export function createPatentProvider(name = "bigquery", options = {}) {
  if (name === "bigquery") return new BigQueryPatentProvider(options);
  throw new Error(`Unknown patent provider: ${name}`);
}
