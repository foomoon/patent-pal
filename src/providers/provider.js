import { BigQueryPatentProvider } from "./bigquery-provider.js";
import { MockPatentProvider } from "./mock-provider.js";

export function createPatentProvider(name = "mock", options = {}) {
  if (name === "mock") return new MockPatentProvider();
  if (name === "bigquery") return new BigQueryPatentProvider(options);
  throw new Error(`Unknown patent provider: ${name}`);
}
