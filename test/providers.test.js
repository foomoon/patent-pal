import test from "node:test";
import assert from "node:assert/strict";
import { createPatentProvider } from "../src/providers/provider.js";

test("mock provider returns the provider-neutral result shape", async () => {
  const response = await createPatentProvider("mock").search("battery cooling");
  assert.equal(response.provider, "mock");
  assert.ok(response.results.length > 0);
  assert.equal(typeof response.results[0].publicationNumber, "string");
  assert.equal(typeof response.results[0].relevance, "number");
});

test("unknown providers are rejected at startup", () => {
  assert.throws(() => createPatentProvider("unknown"), /Unknown patent provider/);
});
