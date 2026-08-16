import test from "node:test";
import assert from "node:assert/strict";
import { BigQueryPatentProvider, deriveTerms, extractFallbackSalientTerms, extractPatentAbstract, extractPatentFigures, extractPatentText, patentUrl } from "../src/providers/bigquery-provider.js";

test("BigQuery retrieval requires meaningful anchors from the original question", () => {
  const options = new BigQueryPatentProvider().queryOptions({
    query: "flush mounted guitar bridge",
    searchTerms: ["flush mounted guitar bridge", "integrated bridge mounting system"]
  });
  assert.deepEqual(options.params.anchors, ["guitar", "bridge"]);
  assert.deepEqual(options.params.modifiers, ["flush", "mounted"]);
  assert.equal(options.params.minimumAnchorMatches, 2);
  assert.match(options.query, /minimumAnchorMatches/);
  assert.match(options.query, /title_terms/);
});

test("Google Patents result links and abstract metadata are normalized", () => {
  assert.equal(patentUrl("US-7297851-B2"), "https://patents.google.com/patent/US7297851B2/en");
  assert.equal(extractPatentAbstract('<meta name="DC.description" content="A &amp; B patent\n abstract">'), "A & B patent abstract");
  assert.deepEqual(extractFallbackSalientTerms("Salient terms: bridge, guitar, saddle."), ["bridge", "guitar", "saddle"]);
  assert.deepEqual(deriveTerms("A pickup plate supports a pickup beneath strings. The pickup is adjustable."), ["pickup", "plate", "supports", "beneath", "strings", "adjustable"]);
  assert.deepEqual(extractPatentFigures('<img itemprop="thumbnail" src="https://patentimages.storage.googleapis.com/a.png"><img itemprop="thumbnail" src="https://patentimages.storage.googleapis.com/b.png"><img itemprop="thumbnail" src="https://patentimages.storage.googleapis.com/c.png">'), ["https://patentimages.storage.googleapis.com/a.png", "https://patentimages.storage.googleapis.com/b.png"]);
  assert.equal(extractPatentText('<heading>BACKGROUND</heading><div class="description-paragraph">A bridge <b>supports</b> strings.</div>'), "BACKGROUND A bridge supports strings.");
});
