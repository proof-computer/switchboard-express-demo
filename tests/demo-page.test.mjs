import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { renderDemoPage } from "../dist/demo-page.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "tests/fixtures/observability-status.json");

describe("Switchboard Express demo page renderer", () => {
  it("renders first-class deployment observability from a static fixture", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    const html = renderDemoPage(status);

    assert.match(html, /<h2>Gateway<\/h2>/);
    assert.match(html, /switchboard-az-01/);
    assert.match(html, /<h2>DNS & CNAME<\/h2>/);
    assert.match(html, /app\.example\.com dns_validated/);
    assert.match(html, /<h2>Route Traffic<\/h2>/);
    assert.match(html, /64\.0 KB/);
    assert.match(html, /<h2>Validators<\/h2>/);
    assert.match(html, /validator-a healthy/);
    assert.match(html, /Diagnostic Data/);
    assert.match(html, /Observability/);
  });
});
