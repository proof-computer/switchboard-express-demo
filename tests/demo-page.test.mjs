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
    const html = renderDemoPage(status, {
      client: {
        ip: "203.0.113.42",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.86 Safari/537.36"
      }
    });

    assert.match(html, /<div class="band brand-bar">/);
    assert.match(html, /<section class="band flow-band">/);
    assert.doesNotMatch(html, /<section class="band summary">/);
    assert.doesNotMatch(html, /<div class="metric">/);
    assert.match(html, /<section class="band acurast-section">/);
    assert.match(html, /<section class="band switchboard-section">/);
    assert.match(html, /<section class="band diagnostics-band">\s*<details class="diagnostics">/);
    assert.match(html, /h1 \{[\s\S]*?max-width: 1180px;/);
    assert.match(html, /--flow-gap-total: 56px/);
    assert.match(html, /\.switchboard-flow \{[\s\S]*?overflow: visible;[\s\S]*?padding: 6px 0 14px;/);
    assert.match(html, /\.flow-dot \{[\s\S]*?background: var\(--beacon\);[\s\S]*?border: 0;/);
    assert.match(html, /\.flow-dot \{[\s\S]*?box-shadow: none;/);
    assert.match(html, /\.flow-chip \{[\s\S]*?min-height: 44px;[\s\S]*?padding: 11px 16px;/);
    assert.match(html, /\.flow-chips \{[\s\S]*?transform: translateY\(-8px\);/);
    assert.match(html, /\.flow-chip-value \{[\s\S]*?top: -2px;/);
    assert.match(html, /\.flow-head \{[\s\S]*?align-items: center;/);
    assert.match(html, /\.flow-title \{[\s\S]*?padding: 0;[\s\S]*?border: 0;/);
    assert.match(html, /\.grid \{[\s\S]*?gap: 22px;/);
    assert.match(html, /\.grid\.switchboard-grid \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*gap: 26px;/);
    assert.match(html, /\.diagnostics-band \{\s*margin-top: 16px;/);
    assert.doesNotMatch(html, /Live request flow/);
    assert.doesNotMatch(html, /section-kicker/);
    assert.match(html, /<h2 class="flow-title">Overview<\/h2>/);
    assert.doesNotMatch(html, /Client to gateway to Acurast processor/);
    assert.doesNotMatch(html, /Evidence-only view of the public route/);
    assert.doesNotMatch(html, /The phone processor is running the demo job/);
    assert.doesNotMatch(html, /Switchboard turns the private Acurast job/);
    assert.doesNotMatch(html, /class="section-copy"|class="flow-subtitle"/);
    assert.match(html, /<h3 class="flow-node-title">Client<\/h3>/);
    assert.match(html, /<h3 class="flow-node-title">Switchboard Gateway<\/h3>/);
    assert.match(html, /<h3 class="flow-node-title">Acurast Processor<\/h3>/);
    assert.match(html, /<span class="flow-row-key">Endpoint<\/span><span class="flow-row-value"><a href="https:\/\/e-q6jmxmk5r2tpyysf2rqs\.acurast\.ingress\.works\//);
    assert.match(html, /<span class="flow-row-key">Browser IP<\/span><span class="flow-row-value">203\.0\.113\.42<\/span>/);
    assert.match(html, /<span class="flow-row-key">User agent<\/span><span class="flow-row-value">Chrome v123<\/span>/);
    assert.doesNotMatch(html, /Chrome\/123\.0\.6312\.86 Safari\/537\.36/);
    assert.match(html, /<span class="flow-row-key">Public IP<\/span><span class="flow-row-value"><span class="line-list"><span class="line-list-item"><span class="public-address" title="United Kingdom GB">195\.22\.134\.245<span class="country-flag">🇬🇧<\/span><\/span><\/span><\/span><\/span>/);
    assert.match(html, /<span class="flow-row-key">Traffic<\/span><span class="flow-row-value">3\.22 MB<\/span>/);
    assert.match(html, /<span class="flow-row-key">Processor ID<\/span><span class="flow-row-value"><span class="mono" title="0xb682629b05949018f9ecd5003c19fd270722da05f42da38ac000ed0a7fc93f20">0xb682629b\.\.\.7fc93f20<\/span><\/span>/);
    assert.match(html, /<span class="flow-row-key">Job network IP<\/span><span class="flow-row-value"><span class="line-list"><span class="line-list-item">192\.168\.3\.66<\/span><\/span><\/span>/);
    assert.match(html, /<span class="flow-chip is-ok"><span class="flow-chip-label">DNS<\/span><span class="flow-chip-value">propagated<\/span><\/span>/);
    assert.match(html, /<span class="flow-chip is-ok"><span class="flow-chip-label">Route<\/span><span class="flow-chip-value">active<\/span><\/span>/);
    assert.match(html, /<span class="flow-chip is-ok"><span class="flow-chip-label">TLS<\/span><span class="flow-chip-value">active<\/span><\/span>/);
    assert.match(html, /<span class="flow-chip is-ok"><span class="flow-chip-label">Validator<\/span><span class="flow-chip-value">healthy<\/span><\/span>/);
    assert.match(html, /<h2>Acurast Runtime<\/h2>/);
    assert.match(html, /<h2>Switchboard Session<\/h2>/);
    assert.doesNotMatch(html, /Acurast familiar|Switchboard proof|Route, DNS, TLS, payment, traffic, and validation/);
    assert.match(html, /<h2>Gateway<\/h2>/);
    assert.match(html, /switchboard-az-01/);
    assert.match(html, /<h2>DNS & CNAME<\/h2>/);
    assert.match(html, /none configured/);
    assert.doesNotMatch(html, /<h2>Route Traffic<\/h2>/);
    assert.match(html, /<h2>Validators<\/h2>/);
    assert.match(html, /route-validation-1778601358-fb6cf3a7 received <time datetime="2026-05-12T15:55:58.321Z" title="2026-05-12T15:55:58.321Z">29 mins ago<\/time>/);
    assert.match(html, /<span class="line-list"><span class="line-list-item">acurast-validator-57930<\/span><\/span>/);
    assert.doesNotMatch(html, /acurast-validator-57930 healthy/);
    assert.match(html, /Diagnostic Data/);
    assert.match(html, /Observability/);
    assert.match(html, /<button type="button" class="field-help-icon" data-tooltip="Canonical public URL served by this Switchboard route\." aria-label="Endpoint: Canonical public URL served by this Switchboard route\.">ⓘ<\/button><span>Endpoint<\/span>/);
    assert.match(html, /@floating-ui\/dom@1\.7\.4/);
    assert.doesNotMatch(html, /class="field-help-icon" title=/);
    assert.doesNotMatch(html, /cursor: help/);
    assert.match(html, /<time datetime="2026-05-12T15:33:07.213Z" title="2026-05-12T15:33:07.213Z">52 mins ago<\/time>/);
    assert.match(html, /<time datetime="2026-05-12T16:22:06.297Z" title="2026-05-12T16:22:06.297Z">3 mins ago<\/time>/);
    assert.match(html, /<time datetime="2026-08-10T23:59:59.000Z" title="2026-08-10T23:59:59.000Z">in [0-9]+ days<\/time>/);
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
    assert.match(html, /<span class="line-list"><span class="line-list-item">acurast-validator-57930<\/span><span class="line-list-item">acurast-validator-57931<\/span><\/span>/);
    assert.doesNotMatch(html, /acurast-validator-57931 healthy/);
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

  it("renders validator work-row report evidence when relay counters lag", async () => {
    const status = JSON.parse(await readFile(fixturePath, "utf8"));
    status.observability.relayUrl = "https://relay-d.switchboard.proof.computer";
    status.observability.payload.validators = {
      available: true,
      counts: {
        work: 5,
        enabledWork: 5,
        reportedWork: 5,
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
          enabled: true,
          lastReportId: "route-validation-live-canary-1",
          lastReportAt: "2026-05-12T16:20:06.297Z",
          lastSuccess: true
        }
      ],
      recentReports: []
    };

    const html = renderDemoPage(status);

    assert.match(html, /<span class="flow-chip is-ok"><span class="flow-chip-label">Validator<\/span><span class="flow-chip-value">healthy<\/span><\/span>/);
    assert.match(html, /relay-d\.switchboard\.proof\.computer/);
    assert.match(html, /route-validation-live-canary-1 received <time datetime="2026-05-12T16:20:06.297Z" title="2026-05-12T16:20:06.297Z">5 mins ago<\/time>/);
    assert.match(html, /<th><span class="field-label"><button type="button" class="field-help-icon" data-tooltip="Recent successful validator reports\."/);
    assert.doesNotMatch(html, /validator launch pending/);
    assert.doesNotMatch(html, /awaiting first report/);
  });
});
