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
    assert.match(html, /none configured/);
    assert.match(html, /<h2>Route Traffic<\/h2>/);
    assert.match(html, /3\.22 MB/);
    assert.match(html, /<h2>Validators<\/h2>/);
    assert.match(html, /acurast-validator-57930 healthy/);
    assert.match(html, /Diagnostic Data/);
    assert.match(html, /Observability/);
    assert.match(html, /<button type="button" class="field-help-icon" data-tooltip="Canonical public URL served by this Switchboard route\." aria-label="Endpoint: Canonical public URL served by this Switchboard route\.">ⓘ<\/button><span>Endpoint<\/span>/);
    assert.match(html, /@floating-ui\/dom@1\.7\.4/);
    assert.doesNotMatch(html, /class="field-help-icon" title=/);
    assert.doesNotMatch(html, /cursor: help/);
    assert.match(html, /<time datetime="2026-05-12T16:24:29.206Z" title="2026-05-12T16:24:29.206Z">22 secs ago<\/time>/);
    assert.match(html, /<time datetime="2026-05-12T15:33:07.213Z" title="2026-05-12T15:33:07.213Z">52 mins ago<\/time>/);
    assert.match(html, /<time datetime="2026-08-10T23:59:59.000Z" title="2026-08-10T23:59:59.000Z">expires in [0-9]+ days<\/time>/);
    assert.doesNotMatch(html, /\+0 B from/);

    const certificateCard = html.match(/<article>\s*<h2>Certificate<\/h2>[\s\S]*?<\/article>/)?.[0] ?? "";
    assert.match(certificateCard, /e-q6jmxmk5r2tpyysf2rqs\.acurast\.ingress\.works/);
    assert.doesNotMatch(certificateCard, /switchboard-1778599587-validation\.ingress\.digital/);
  });

  it("renders gateway public-address flags from status GeoIP data", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));

    const html = renderDemoPage(status);

    assert.match(html, /195\.22\.134\.245<span class="country-flag">🇬🇧<\/span>/);
  });

  it("renders relay DNS and validator rows as separate lines", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    status.observability.payload.validators.validators.push({
      validatorId: "acurast-validator-57931",
      status: "healthy",
      latestReportAt: "2026-05-12T15:54:57.797Z"
    });
    status.observability.payload.validators.counts.validators = 2;

    const html = renderDemoPage(status);

    assert.match(html, /<span class="line-list"><span class="line-list-item">2a09:8280:1::114:6d6a:0 IPv6<\/span><span class="line-list-item">66\.241\.125\.160 IPv4<\/span><\/span>/);
    assert.match(html, /<span class="line-list"><span class="line-list-item">acurast-validator-57930 healthy <time datetime="2026-05-12T15:55:58.436Z" title="2026-05-12T15:55:58.436Z">29 mins ago<\/time><\/span><span class="line-list-item">acurast-validator-57931 healthy <time datetime="2026-05-12T15:54:57.797Z" title="2026-05-12T15:54:57.797Z">30 mins ago<\/time><\/span><\/span>/);
  });

  it("renders intentional empty states instead of generic not-set placeholders", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    status.registration = {
      state: "registered",
      relayResponse: {
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        blockNumber: 123456
      }
    };
    status.relayDiagnostics = {
      dns: {
        ok: true,
        addresses: [
          { address: "66.241.125.160", family: 4 }
        ]
      },
      health: {
        ok: true,
        status: 200,
        elapsedMs: 31
      }
    };
    status.runtime.appVersion = "0.1.3";
    status.challenges.last = {
      nonceLength: 16,
      userAgent: "curl/8.20.0",
      remoteAddress: "192.168.3.4"
    };
    status.observability.payload.dns.canonical.materialization = {
      status: "propagated",
      targetIp: "195.22.134.245",
      targetIps: ["195.22.134.245"]
    };
    status.observability.payload.dns.customerHostnames = {
      available: true,
      count: 0,
      hostnames: []
    };
    status.observability.payload.validators = {
      available: true,
      counts: {
        work: 0,
        enabledWork: 0,
        reports: 0,
        successes: 0,
        failures: 0,
        validators: 0
      },
      validators: [],
      work: [],
      recentReports: []
    };

    const html = renderDemoPage(status);

    assert.match(html, /195\.22\.134\.245/);
    assert.match(html, /none configured/);
    assert.match(html, /not applicable/);
    assert.match(html, /0x12345678\.\.\.90abcdef/);
    assert.match(html, /assethub-polkadot\.subscan\.io\/block\/123456/);
    assert.match(html, /not scheduled/);
    assert.match(html, /0\.1\.3/);
    assert.doesNotMatch(html, /not set/);
  });

  it("renders pending validator launch as an intentional state", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    status.observability.payload.validators = {
      available: true,
      counts: {
        work: 1,
        enabledWork: 1,
        reports: 0,
        successes: 0,
        failures: 0,
        validators: 0
      },
      validators: [],
      work: [
        {
          workId: "live-canary-validator-1",
          mode: "route_open",
          intervalSeconds: 60,
          enabled: true
        }
      ],
      recentReports: []
    };

    const html = renderDemoPage(status);

    assert.match(html, /validator launch pending/);
    assert.match(html, /awaiting first report/);
  });
});
