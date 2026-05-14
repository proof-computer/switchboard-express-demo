interface HtmlFragment {
  __html: string;
}

interface DeploymentInfo {
  raw: string;
  id?: string;
  kind?: string;
}

interface TimeRenderOptions {
  nowMs?: number;
  mode?: "relative" | "expires";
}

export interface DemoPageClientInfo {
  ip?: string;
  userAgent?: string;
  userAgentSummary?: string;
}

export interface DemoPageRenderOptions {
  client?: DemoPageClientInfo;
}

interface FlowRenderOptions {
  publicUrl?: string;
  publicHostname?: string;
  gatewayGeoIp: Record<string, Record<string, unknown>>;
  observability?: Record<string, any>;
  dns?: Record<string, any>;
  certificate?: Record<string, any>;
  validatorSummary?: Record<string, any>;
  deployment?: DeploymentInfo;
  client?: DemoPageClientInfo;
}

const FIELD_HELP: Record<string, string> = {
  "TLS Certificate": "Certificate authority and expiry state for the route TLS certificate.",
  "Hub Registration": "Polkadot Hub registration state for this Switchboard route.",
  "Acurast Runtime": "Runtime environment reported by the Acurast job.",
  "Route Traffic": "Gateway traffic counters for the public route.",
  Endpoint: "Canonical public URL served by this Switchboard route.",
  Challenge: "Public challenge endpoint used to prove the job is reachable.",
  Relay: "Switchboard relay/control-plane endpoint used by this demo job.",
  "Observability relay": "Relay/control-plane endpoint that supplied the selected observability snapshot.",
  "Gateway ID": "Gateway selected to publish and serve this route.",
  "Relay DNS": "DNS lookup result for the relay/control-plane hostname.",
  "Relay health": "Relay health probe result from the demo job.",
  Operator: "Operator identity associated with the selected gateway.",
  Processor: "Acurast processor identity backing the selected gateway.",
  "Capability report": "Latest signed gateway capability report identifier.",
  "Route state": "Whether the gateway can poll and apply route state.",
  "Active routes": "Number of active routes currently reported by the gateway.",
  Capacity: "Total route capacity reported by the gateway.",
  "Public addresses": "Public IP addresses advertised by the gateway.",
  "Canonical hostname": "Canonical hostname served by this Switchboard route.",
  "Canonical DNS": "DNS materialization state for the canonical hostname.",
  "DNS target": "Gateway IP target currently published in DNS.",
  "Customer hostnames": "Developer-owned CNAME hostnames attached to this endpoint.",
  "ACME records": "DNS records needed for customer-hostname certificate validation.",
  "Local requests": "Requests observed directly by the demo application.",
  "Local sent": "Response bytes sent by the demo application.",
  "Local received": "Request bytes received by the demo application.",
  "Gateway connections": "Connections observed by the selected gateway for this route.",
  "Gateway received": "Request bytes observed by the selected gateway.",
  "Gateway sent": "Response bytes observed by the selected gateway.",
  "Metric source": "Source that produced the gateway route metrics.",
  Sampled: "When the gateway route metrics were sampled.",
  Deployment: "Acurast deployment associated with this demo job.",
  Job: "Acurast job identifier reported by the runtime.",
  "Job signer": "Job signing address used for Switchboard job proofs.",
  "Signer mode": "Signing backend used by the demo job.",
  Runtime: "Runtime platform and Node.js version reported by the job.",
  Started: "When the demo job process started.",
  Uptime: "How long the demo job process has been running.",
  "Chain ID": "Polkadot Hub chain identifier configured for settlement.",
  Registry: "Switchboard registry contract address configured for this route.",
  Session: "Switchboard session identifier associated with the route.",
  Registration: "Registration state and relay response for this route.",
  Tx: "Hub transaction hash or observation status for registration.",
  Block: "Hub block associated with the registration transaction.",
  State: "Current state reported for this section.",
  Hostname: "Primary hostname covered by the certificate.",
  Issuer: "Certificate authority that issued the active TLS certificate.",
  Expires: "Expiry time for the active TLS certificate.",
  Hostnames: "All hostnames requested or covered by the certificate state.",
  Count: "Number of challenge endpoint hits seen by the demo app.",
  "Last at": "Most recent challenge endpoint hit time.",
  "Nonce length": "Length of the last challenge nonce received.",
  "User agent": "User agent from the last challenge request.",
  "Remote address": "Remote address from the last challenge request.",
  "Assigned validators": "Number of validators assigned to observe this route.",
  "Work packages": "Validator work packages configured for this route.",
  "Recent reports": "Recent validator reports available for this route.",
  Successes: "Recent successful validator reports.",
  Failures: "Recent failed validator reports.",
  "Latest report": "Newest validator report summary.",
  Validators: "Validator identities assigned to observe this route.",
  Node: "Node.js runtime version running the demo app.",
  Platform: "Operating-system platform and CPU architecture.",
  "Acurast STD": "Whether the Acurast runtime standard library is present.",
  "Secp256k1 signer": "Whether the Acurast secp256k1 signer is available.",
  "Network allowlist": "Whether the Acurast network allowlist API is available.",
  "App version": "Version of the demo package reported by the runtime.",
  Certificate: "Certificate status payload reported by the demo app.",
  Traffic: "Local and gateway traffic payloads reported by the demo app.",
  Observability: "Relay observability payload cached by the demo app.",
  "Relay diagnostics": "Relay DNS and health diagnostics collected by the demo app.",
  Network: "Local network address summary from the demo runtime.",
  "Environment presence": "Boolean summary of relevant environment variables."
};

export function renderDemoPage(status: Record<string, any>, options: DemoPageRenderOptions = {}): string {
  const publicUrl = stringValue(status.public?.url);
  const publicHostname = stringValue(status.public?.hostname);
  const publicLabel = publicHostname ? shortHostname(publicHostname) : publicUrl;
  const challengeUrl = stringValue(status.public?.challengeUrl);
  const certificate = primaryCertificate(status);
  const relayHealth = status.relayDiagnostics?.health;
  const relayDns = status.relayDiagnostics?.dns;
  const deployment = deploymentInfo(status.ids?.deploymentId);
  const deploymentLink = deploymentHtml(deployment);
  const observability = observabilityPayload(status);
  const validatorSummary = observability?.validators;
  const validatorCountSummary = validatorSummary ? validatorCounts(validatorSummary) : {};
  const dns = observability?.dns;
  const nowMs = timestampMs(status.now) ?? Date.now();
  const gatewayGeoIp = geoIpPayload(status.gatewayGeoIp);
  const certificateHostnames = certificateHostnamesSummary(status);
  const flow = switchboardFlowHtml(status, {
    publicUrl,
    publicHostname,
    gatewayGeoIp,
    observability,
    dns,
    certificate,
    validatorSummary,
    deployment,
    client: clientRenderInfo(options.client)
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Switchboard demo</title>
  <style>
    :root {
      color-scheme: light;
      --beacon: #ff6a2c;
      --ink: #0e1218;
      --ink-soft: #1a2030;
      --frost: #f7f8fa;
      --hull: #1a2538;
      --tide: #0e7cff;
      --smoke: #e7eaee;
      --stone: #9098a6;
      --steel: #3d4654;
      --acurast-green: #c0e700;
      --panel: #ffffff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--frost);
      color: var(--ink);
      font-size: 16px;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    a {
      color: var(--ink);
      text-decoration-color: var(--beacon);
      text-decoration-thickness: 2px;
      text-underline-offset: 4px;
      overflow-wrap: anywhere;
    }
    a:hover { text-decoration-color: var(--ink); }
    .shell {
      width: 100%;
      margin: 0;
      padding: 0 0 44px;
    }
    .band {
      width: 100%;
      padding-left: clamp(16px, 3vw, 44px);
      padding-right: clamp(16px, 3vw, 44px);
    }
    .brand-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding-top: 24px;
      padding-bottom: 18px;
      border-bottom: 1px solid var(--smoke);
      color: var(--ink);
    }
    .proof-mark {
      width: 32px;
      height: 32px;
      flex: 0 0 auto;
      border-radius: 50%;
      background: var(--beacon);
    }
    .proof-wordmark {
      font-size: 22px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0;
    }
    .proof-wordmark .dot { color: var(--beacon); }
    .brand-spacer { flex: 1; }
    .brand-doc-tag {
      color: var(--stone);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    header {
      margin: 0;
      padding-top: 84px;
      padding-bottom: 78px;
      background: var(--hull);
      color: var(--frost);
      overflow: hidden;
      position: relative;
    }
    header::after {
      position: absolute;
      content: "";
      inset: 0;
      background: linear-gradient(90deg, rgba(26, 37, 56, 0) 0%, rgba(26, 37, 56, 0.04) 62%, rgba(26, 37, 56, 0.38) 100%);
      pointer-events: none;
      z-index: 0;
    }
    .hero-cable {
      position: absolute;
      top: -82px;
      right: -184px;
      width: 520px;
      height: 340px;
      opacity: 1;
      pointer-events: none;
      z-index: 1;
    }
    .header-copy {
      position: relative;
      z-index: 2;
    }
    h1 {
      max-width: 1180px;
      margin: 0;
      font-size: 92px;
      line-height: 0.98;
      font-weight: 800;
      letter-spacing: 0;
    }
    .accent { color: var(--beacon); }
    .acurast-accent { color: var(--acurast-green); }
    .section-heading {
      margin: 30px 0 12px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 18px;
    }
    .section-heading h2 {
      margin: 0;
      padding: 0;
      border: 0;
      font-size: 32px;
      line-height: 1.1;
      font-weight: 800;
    }
    article, .diagnostics, .flow-node {
      border: 1px solid var(--smoke);
      border-radius: 8px;
      background: var(--panel);
      box-shadow: 0 10px 24px rgba(14, 18, 24, 0.06);
    }
    .label {
      display: block;
      color: var(--stone);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .field-label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
    }
    .field-help-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 13px;
      height: 13px;
      flex: 0 0 auto;
      border: 0;
      padding: 0;
      background: transparent;
      color: var(--stone);
      font: inherit;
      font-size: 10px;
      line-height: 1;
      text-transform: none;
      cursor: default;
    }
    .field-help-icon:hover, .field-help-icon:focus-visible { color: var(--steel); }
    .field-help-icon:focus-visible {
      outline: 2px solid rgba(14, 124, 255, 0.45);
      outline-offset: 2px;
      border-radius: 999px;
    }
    .field-tooltip {
      position: absolute;
      z-index: 1000;
      max-width: min(280px, calc(100vw - 24px));
      padding: 8px 10px;
      border-radius: 6px;
      background: var(--ink);
      color: #fff;
      box-shadow: 0 10px 28px rgba(14, 18, 24, 0.18);
      font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      text-transform: none;
      letter-spacing: 0;
      pointer-events: none;
    }
    .field-tooltip[data-hidden="true"] { display: none; }
    .line-list {
      display: grid;
      gap: 3px;
    }
    .line-list-item {
      display: block;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .country-flag {
      margin-left: 4px;
    }
    .flow-band {
      --flow-gap: 28px;
      --flow-gap-total: 56px;
      padding-top: 24px;
      padding-bottom: 8px;
    }
    .switchboard-flow {
      position: relative;
      overflow: visible;
      padding: 6px 0 14px;
    }
    .flow-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 20px;
    }
    .flow-title {
      margin: 0;
      padding: 0;
      border: 0;
      font-size: 34px;
      line-height: 1.1;
      font-weight: 800;
    }
    .flow-rail {
      position: relative;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      align-items: center;
      gap: var(--flow-gap);
      height: 48px;
      margin: 0;
    }
    .flow-line {
      position: absolute;
      left: calc((100% - var(--flow-gap-total)) / 6);
      right: calc((100% - var(--flow-gap-total)) / 6);
      top: 50%;
      height: 6px;
      border-radius: 999px;
      background: var(--beacon);
      transform: translateY(-50%);
    }
    .flow-dot {
      position: relative;
      z-index: 1;
      justify-self: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--beacon);
      border: 0;
      box-shadow: none;
    }
    .flow-dot:nth-child(2) { grid-column: 1; }
    .flow-dot:nth-child(3) { grid-column: 2; }
    .flow-dot:nth-child(4) { grid-column: 3; }
    .flow-nodes {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--flow-gap);
      margin-top: 10px;
    }
    .flow-node {
      min-width: 0;
      padding: 22px;
    }
    .flow-node-label {
      margin: 0 0 3px;
      color: var(--stone);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1;
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 0;
    }
    .flow-node-title {
      margin: 0 0 16px;
      font-size: 24px;
      line-height: 1.2;
      font-weight: 800;
    }
    .flow-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
      padding: 11px 0;
      border-top: 1px solid #edf0f4;
    }
    .flow-row-key {
      color: var(--stone);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .flow-row-value {
      min-width: 0;
      font-size: 15px;
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .flow-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 20px;
      transform: translateY(-8px);
    }
    .flow-chip {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-height: 44px;
      border: 1px solid var(--smoke);
      border-radius: 999px;
      padding: 11px 16px;
      background: #fbfcfd;
      color: var(--steel);
      font-size: 16px;
      font-weight: 800;
      line-height: 1;
    }
    .flow-chip::before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--stone);
    }
    .flow-chip.is-ok::before { background: var(--acurast-green); }
    .flow-chip.is-warn::before { background: var(--beacon); }
    .flow-chip-label {
      color: var(--stone);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .flow-chip-value {
      position: relative;
      top: -2px;
      line-height: 1;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 22px;
    }
    .grid.acurast-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .grid.switchboard-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 26px;
    }
    article {
      min-width: 0;
      overflow: hidden;
    }
    h2 {
      margin: 0;
      padding: 18px 20px;
      border-bottom: 1px solid var(--smoke);
      font-size: 19px;
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      padding: 13px 20px;
      vertical-align: top;
      border-bottom: 1px solid #edf0f4;
      overflow-wrap: anywhere;
    }
    th {
      width: 34%;
      color: var(--stone);
      text-align: left;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    td { font-size: 16px; font-weight: 610; }
    tr:last-child th, tr:last-child td { border-bottom: 0; }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      color: var(--ink-soft);
    }
    code, .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 14px;
    }
    .muted { color: var(--stone); font-weight: 520; }
    .diagnostics-band {
      margin-top: 16px;
    }
    .diagnostics {
      overflow: hidden;
    }
    .diagnostics summary {
      cursor: pointer;
      padding: 18px 20px;
      font-size: 19px;
      font-weight: 800;
    }
    .diagnostics table { border-top: 1px solid var(--smoke); }
    @media (max-width: 1040px) {
      h1 { font-size: 72px; }
      .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .flow-nodes { grid-template-columns: 1fr; }
      .flow-rail { display: none; }
    }
    @media (max-width: 820px) {
      .shell { padding-bottom: 28px; }
      .band {
        padding-left: 10px;
        padding-right: 10px;
      }
      .brand-bar { align-items: flex-start; }
      .brand-doc-tag { display: none; }
      header {
        padding-top: 58px;
        padding-bottom: 54px;
      }
      header::after {
        background: linear-gradient(90deg, rgba(26, 37, 56, 0) 0%, rgba(26, 37, 56, 0.08) 78%, rgba(26, 37, 56, 0.4) 100%);
      }
      .hero-cable {
        top: -38px;
        right: -286px;
        width: 430px;
        height: 260px;
        opacity: 1;
      }
      .grid, .grid.acurast-grid { grid-template-columns: 1fr; }
      .grid.switchboard-grid { grid-template-columns: 1fr; }
      .switchboard-flow { padding: 0; }
      .flow-head, .section-heading { display: block; }
      h1 {
        font-size: 40px;
        line-height: 1.04;
      }
      .acurast-accent { display: block; }
      th, td { display: block; width: 100%; }
      th { padding-bottom: 2px; border-bottom: 0; }
      td { padding-top: 2px; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <div class="band brand-bar">
      <span class="proof-mark" aria-hidden="true"></span>
      <span class="proof-wordmark">PROOF<span class="dot">.</span></span>
      <span class="brand-spacer"></span>
      <span class="brand-doc-tag">Switchboard · Acurast webserver</span>
    </div>

    <header class="band">
      <svg class="hero-cable" viewBox="0 0 720 480" aria-hidden="true">
        <path d="M 60 380 Q 360 -120, 660 380" stroke="#ff6a2c" stroke-width="36" stroke-linecap="round" fill="none"/>
        <circle cx="60" cy="380" r="56" fill="#ff6a2c"/>
        <circle cx="660" cy="380" r="56" fill="#ff6a2c"/>
      </svg>
      <div class="header-copy">
        <h1>Running on <span class="acurast-accent">Acurast.</span><br/>Ingress by <span class="accent">Switchboard.</span></h1>
      </div>
    </header>

    <section class="band flow-band">
      ${flow}
    </section>

    <section class="band acurast-section">
      <div class="section-heading">
        <div>
          <h2>Acurast Runtime</h2>
        </div>
      </div>
      <div class="grid acurast-grid">
        <article>
          <h2>Acurast Job</h2>
          ${tableHtml([
            ["Deployment", deploymentLink],
            ["Job", hashHtml(status.ids?.jobId)],
            ["Job signer", hashHtml(status.ids?.jobSigner)],
            ["Signer mode", status.ids?.signerMode],
            ["Runtime", runtimeLabel(status)],
            ["Started", formatDateTime(status.startedAt, { nowMs })],
            ["Uptime", formatDuration(Number(status.uptimeSeconds ?? 0))]
          ])}
        </article>

        <article>
          <h2>Runtime Details</h2>
          ${tableHtml([
            ["Node", status.runtime?.nodeVersion],
            ["Platform", `${status.runtime?.platform ?? "unknown"} ${status.runtime?.arch ?? ""}`.trim()],
            ["Acurast STD", boolLabel(status.runtime?.hasStd)],
            ["Secp256k1 signer", boolLabel(status.runtime?.hasStdSignersSecp256k1)],
            ["Network allowlist", boolLabel(status.runtime?.hasStdNetAddAllowedHostnames)],
            ["App version", status.runtime?.appVersion ?? "unreported"]
          ])}
        </article>
      </div>
    </section>

    <section class="band switchboard-section">
      <div class="section-heading">
        <div>
          <h2>Switchboard Session</h2>
        </div>
      </div>
      <div class="grid switchboard-grid">
      <article>
        <h2>Route</h2>
        ${tableHtml([
          ["Endpoint", publicUrl ? linkHtml(publicUrl, publicLabel ?? publicUrl, publicUrl) : undefined],
          ["Challenge", challengeUrl ? linkHtml(challengeUrl, "/.well-known/proofcomputer/challenge", challengeUrl) : undefined],
          ["Relay", status.routing?.relayUrl ? linkHtml(status.routing.relayUrl, status.routing?.relayHost ?? status.routing.relayUrl, status.routing.relayUrl) : undefined],
          ...optionalRow("Observability relay", observabilityRelayLink(status)),
          ...optionalRow("Gateway ID", knownGatewayId(status)),
          ["Relay DNS", relayDns?.ok ? formatAddressList(relayDns.addresses) : relayDns?.error],
          ["Relay health", relayHealth?.ok ? `HTTP ${relayHealth.status} in ${relayHealth.elapsedMs}ms` : relayHealth?.error]
        ])}
      </article>

      <article>
        <h2>Gateway</h2>
        ${tableHtml([
          ["Gateway ID", observability?.gateway?.gatewayId ?? knownGatewayId(status)],
          ["Operator", hashHtml(observability?.gateway?.operatorId ?? status.routing?.operatorId)],
          ["Processor", hashHtml(observability?.gateway?.processorId ?? status.routing?.processorId)],
          ["Capability report", observability?.gateway?.capability?.latestReport?.reportId],
          ["Route state", boolLabel(observability?.gateway?.capability?.routeStateAvailable)],
          ["Active routes", observability?.gateway?.capability?.activeRouteCount],
          ["Capacity", observability?.gateway?.capability?.routeCapacity],
          ["Public addresses", publicAddressesSummary(observability?.gateway?.capability?.publicAddresses, gatewayGeoIp)]
        ])}
      </article>

      <article>
        <h2>DNS & CNAME</h2>
        ${tableHtml([
          ["Canonical hostname", dns?.canonical?.hostname ?? status.public?.hostname],
          ["Canonical DNS", dns?.canonical?.materialization?.status ?? dns?.canonical?.materialization?.state],
          ["DNS target", dnsTargetSummary(dns?.canonical?.materialization)],
          ["Customer hostnames", customerHostnamesSummary(dns?.customerHostnames)],
          ["ACME records", acmeRecordsSummary(dns?.customerHostnames)]
        ])}
      </article>

      <article>
        <h2>Polkadot Hub</h2>
        ${tableHtml([
          ["Chain ID", status.routing?.chainId],
          ["Registry", hashHtml(status.routing?.registryAddress)],
          ["Session", hashHtml(status.ids?.sessionId)],
          ["Registration", status.registration?.state],
          ["Tx", registrationTxSummary(status.registration)],
          ["Block", registrationBlockSummary(status.registration)]
        ])}
      </article>

      <article>
        <h2>Certificate</h2>
        ${tableHtml([
          ["State", status.certificate?.state],
          ["Hostname", certificate?.hostname ?? status.public?.hostname],
          ["Issuer", certificate?.issuer],
          ["Expires", formatDateTime(certificate?.notAfter, { nowMs })],
          ["Hostnames", certificateHostnames]
        ])}
      </article>

      <article>
        <h2>Challenges</h2>
        ${tableHtml([
          ["Count", status.challenges?.count],
          ["Last at", formatDateTime(status.challenges?.lastAt, { nowMs })],
          ["Nonce length", status.challenges?.last?.nonceLength],
          ["User agent", summarizeUserAgent(status.challenges?.last?.userAgent)],
          ["Remote address", status.challenges?.last?.remoteAddress]
        ])}
      </article>

      <article>
        <h2>Validators</h2>
        ${tableHtml([
          ["State", validatorStateSummary(validatorSummary)],
          ["Assigned validators", validatorCountSummary.validators],
          ["Work packages", validatorCountSummary.work],
          ["Recent reports", validatorCountSummary.reports],
          ["Successes", validatorCountSummary.successes],
          ["Failures", validatorCountSummary.failures],
          ["Latest report", latestValidatorReportSummary(validatorSummary, nowMs)],
          ["Validators", validatorRowsSummary(validatorSummary)]
        ])}
      </article>
      </div>
    </section>

    <section class="band diagnostics-band">
      <details class="diagnostics">
        <summary>Diagnostic Data</summary>
        ${tableHtml([
          ["Registration", status.registration],
          ["Certificate", status.certificate],
          ["Traffic", status.traffic],
          ["Observability", status.observability],
          ["Relay diagnostics", status.relayDiagnostics],
          ["Network", status.network],
          ["Environment presence", status.envPresence]
        ])}
      </details>
    </section>
  </div>
  <script type="module">
    import { autoUpdate, computePosition, flip, offset, shift } from "https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.4/+esm";

    const tooltip = document.createElement("div");
    tooltip.className = "field-tooltip";
    tooltip.id = "field-help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.dataset.hidden = "true";
    document.body.appendChild(tooltip);

    let activeAnchor;
    let cleanup;

    function showTooltip(anchor) {
      const text = anchor.dataset.tooltip;
      if (!text) return;
      activeAnchor = anchor;
      tooltip.textContent = text;
      tooltip.dataset.hidden = "false";
      anchor.setAttribute("aria-describedby", tooltip.id);
      cleanup?.();
      cleanup = autoUpdate(anchor, tooltip, () => {
        computePosition(anchor, tooltip, {
          placement: "top",
          middleware: [offset(8), flip(), shift({ padding: 8 })]
        }).then(({ x, y }) => {
          Object.assign(tooltip.style, {
            left: x + "px",
            top: y + "px"
          });
        });
      });
    }

    function hideTooltip(anchor) {
      if (anchor && activeAnchor && anchor !== activeAnchor) return;
      cleanup?.();
      cleanup = undefined;
      activeAnchor?.removeAttribute("aria-describedby");
      activeAnchor = undefined;
      tooltip.dataset.hidden = "true";
    }

    document.querySelectorAll("[data-tooltip]").forEach((anchor) => {
      anchor.addEventListener("mouseenter", () => showTooltip(anchor));
      anchor.addEventListener("focus", () => showTooltip(anchor));
      anchor.addEventListener("mouseleave", () => hideTooltip(anchor));
      anchor.addEventListener("blur", () => hideTooltip(anchor));
      anchor.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideTooltip(anchor);
      });
    });
  </script>
</body>
</html>`;
}

function tableHtml(rows: Array<[string, unknown]>): string {
  return `<table><tbody>${rows
    .map(([label, value]) => `<tr><th>${fieldLabelHtml(label)}</th><td>${renderValue(value)}</td></tr>`)
    .join("")}</tbody></table>`;
}

function fieldLabelHtml(label: string): string {
  const help = FIELD_HELP[label];
  if (!help) {
    return escapeHtml(label);
  }
  return `<span class="field-label"><button type="button" class="field-help-icon" data-tooltip="${escapeHtml(help)}" aria-label="${escapeHtml(`${label}: ${help}`)}">ⓘ</button><span>${escapeHtml(label)}</span></span>`;
}

function linkHtml(href: string, label: string, title = href): HtmlFragment {
  return {
    __html: `<a href="${escapeHtml(href)}" title="${escapeHtml(title)}">${escapeHtml(label)}</a>`
  };
}

function externalLinkHtml(href: string, label: string, title = href): HtmlFragment {
  return {
    __html: `<a href="${escapeHtml(href)}" title="${escapeHtml(title)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
  };
}

function htmlFragment(html: string): HtmlFragment {
  return { __html: html };
}

function switchboardFlowHtml(status: Record<string, any>, options: FlowRenderOptions): string {
  const gatewayId = stringValue(options.observability?.gateway?.gatewayId) ?? knownGatewayId(status);
  const gatewayAddresses = publicAddressesSummary(options.observability?.gateway?.capability?.publicAddresses, options.gatewayGeoIp);
  const firstRouteMetric = firstRouteMetricRow(status);
  const gatewayTraffic = formatBytes(counterValue(firstRouteMetric, "downstreamBytesSentTotal"));
  const processorId =
    stringValue(options.observability?.gateway?.processorId) ??
    stringValue(status.routing?.processorId) ??
    stringValue(status.acurast?.processorId);
  const jobNetworkIps = Array.isArray(status.network?.publicIpv4)
    ? status.network.publicIpv4.map((item: unknown) => stringValue(item)).filter((item: unknown): item is string => Boolean(item))
    : [];
  const endpoint = options.publicUrl && options.publicHostname
    ? linkHtml(options.publicUrl, shortHostname(options.publicHostname), options.publicUrl)
    : options.publicUrl ?? options.publicHostname;
  const routeStatus = routeStatusSummary(options.observability);
  const dnsStatus = stringValue(options.dns?.canonical?.materialization?.status ?? options.dns?.canonical?.materialization?.state);
  const tlsStatus = stringValue(status.certificate?.state);
  const validatorStatus = validatorStateSummary(options.validatorSummary);
  const clientIp = stringValue(options.client?.ip);
  const clientUserAgent = stringValue(options.client?.userAgentSummary) ?? summarizeUserAgent(options.client?.userAgent);

  return `<section class="switchboard-flow" aria-label="Switchboard request flow">
    <div class="flow-head">
      <div>
        <h2 class="flow-title">Overview</h2>
      </div>
      <div class="flow-chips" aria-label="Route proof status">
        ${flowChipHtml("DNS", dnsStatus, dnsStatus === "propagated")}
        ${flowChipHtml("Route", routeStatus, routeStatus === "active")}
        ${flowChipHtml("TLS", tlsStatus, tlsStatus === "active")}
        ${flowChipHtml("Validator", validatorStatus, validatorStatus === "healthy")}
      </div>
    </div>
    <div class="flow-rail" aria-hidden="true">
      <span class="flow-line"></span>
      <span class="flow-dot"></span>
      <span class="flow-dot"></span>
      <span class="flow-dot"></span>
    </div>
    <div class="flow-nodes">
      ${flowNodeHtml("Browser", "Client", [
        ["Endpoint", endpoint],
        ...optionalRow("Browser IP", clientIp),
        ...optionalRow("User agent", clientUserAgent),
        ["Session", hashHtml(status.ids?.sessionId)]
      ])}
      ${flowNodeHtml("Ingress", "Switchboard Gateway", [
        ["Gateway ID", gatewayId],
        ["Public IP", gatewayAddresses],
        ["Traffic", gatewayTraffic],
        ["Operator", hashHtml(options.observability?.gateway?.operatorId ?? status.routing?.operatorId)]
      ])}
      ${flowNodeHtml("Runtime", "Acurast Processor", [
        ["Processor ID", hashHtml(processorId)],
        ["Deployment", deploymentHtml(options.deployment)],
        ["Device", hashHtml(status.acurast?.deviceAddress)],
        ["Job network IP", jobNetworkIps]
      ])}
    </div>
  </section>`;
}

function flowNodeHtml(label: string, title: string, rows: Array<[string, unknown]>): string {
  return `<div class="flow-node">
    <p class="flow-node-label">${escapeHtml(label)}</p>
    <h3 class="flow-node-title">${escapeHtml(title)}</h3>
    ${rows.map(([key, value]) => flowRowHtml(key, value)).join("")}
  </div>`;
}

function flowRowHtml(key: string, value: unknown): string {
  return `<div class="flow-row"><span class="flow-row-key">${escapeHtml(key)}</span><span class="flow-row-value">${renderFlowValue(value)}</span></div>`;
}

function renderFlowValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return '<span class="muted">not reported</span>';
  }
  if (isHtmlFragment(value)) {
    return value.__html;
  }
  if (Array.isArray(value)) {
    const list = lineListHtml(value);
    return list ? list.__html : '<span class="muted">not reported</span>';
  }
  if (typeof value === "string") {
    return escapeHtml(value);
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return escapeHtml(String(value));
  }
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function flowChipHtml(label: string, value: unknown, ok: boolean): string {
  const text = scalarValue(value) ?? "not reported";
  const stateClass = ok ? " is-ok" : text === "not reported" || text === "unknown" ? "" : " is-warn";
  return `<span class="flow-chip${stateClass}"><span class="flow-chip-label">${escapeHtml(label)}</span><span class="flow-chip-value">${escapeHtml(text)}</span></span>`;
}

function clientRenderInfo(value: DemoPageClientInfo | undefined): DemoPageClientInfo | undefined {
  if (!value) {
    return undefined;
  }
  return {
    ip: stringValue(value.ip),
    userAgent: stringValue(value.userAgent),
    userAgentSummary: stringValue(value.userAgentSummary)
  };
}

function summarizeUserAgent(value: unknown): string | undefined {
  const text = stringValue(value)?.trim();
  if (!text) {
    return undefined;
  }
  const browserPatterns: Array<[RegExp, string]> = [
    [/\bEdg(?:A|iOS)?\/(\d+)/, "Edge"],
    [/\bOPR\/(\d+)/, "Opera"],
    [/\b(?:Chrome|CriOS)\/(\d+)/, "Chrome"],
    [/\b(?:Firefox|FxiOS)\/(\d+)/, "Firefox"],
    [/\bVersion\/(\d+)(?:\.\d+)*\b[\s\S]*\bSafari\//, "Safari"],
    [/\bcurl\/(\d+)/i, "curl"],
    [/\b(?:node|undici)\/?(\d+)/i, "Node"]
  ];
  for (const [pattern, label] of browserPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return `${label} v${match[1]}`;
    }
  }
  if (/^undici$/i.test(text)) {
    return "Node";
  }
  return "unknown browser";
}

function routeStatusSummary(observability: Record<string, any> | undefined): string | undefined {
  const route = recordValue(recordValue(observability, "availability"), "route");
  const routeStatus = stringValue(route?.status);
  if (routeStatus) {
    return routeStatus;
  }
  const routeState = recordValue(observability, "routeState");
  if (routeState?.desired === true) {
    return "active";
  }
  return stringValue(routeState?.reason);
}

function lineListHtml(values: unknown[]): HtmlFragment | undefined {
  const items = values.map((value) => inlineHtml(value)).filter((value): value is string => Boolean(value));
  if (items.length === 0) {
    return undefined;
  }
  return htmlFragment(`<span class="line-list">${items.map((item) => `<span class="line-list-item">${item}</span>`).join("")}</span>`);
}

function hashHtml(value: unknown): unknown {
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  return withTitle(shortValue(text), text, "mono");
}

function withTitle(label: unknown, title: unknown, className?: string): HtmlFragment | unknown {
  const labelText = stringValue(label);
  const titleText = stringValue(title);
  if (!labelText || !titleText || labelText === titleText) {
    return label;
  }
  const classAttr = className ? ` class="${escapeHtml(className)}"` : "";
  return {
    __html: `<span${classAttr} title="${escapeHtml(titleText)}">${escapeHtml(labelText)}</span>`
  };
}

function renderValue(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return '<span class="muted">not set</span>';
  }
  if (isHtmlFragment(value)) {
    return value.__html;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '<span class="muted">none</span>';
    }
    return value.map((item) => renderValue(item)).join(", ");
  }
  if (typeof value === "string") {
    return escapeHtml(value);
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return escapeHtml(String(value));
  }
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function isHtmlFragment(value: unknown): value is HtmlFragment {
  return Boolean(value && typeof value === "object" && typeof (value as HtmlFragment).__html === "string");
}

function primaryCertificate(status: Record<string, any>): Record<string, any> | undefined {
  const certificate = status.certificate?.certificates?.[0];
  return certificate && typeof certificate === "object" ? certificate : undefined;
}

function certificateHostnamesSummary(status: Record<string, any>): string[] | undefined {
  const candidates = Array.isArray(status.certificate?.hostnames)
    ? status.certificate.hostnames
    : Array.isArray(status.public?.certificateHostnames)
      ? status.public.certificateHostnames
      : [];
  const hostnames = uniqueStrings(candidates)
    .map((hostname) => hostname.toLowerCase())
    .filter((hostname) => !looksLikeValidationHostname(hostname));
  return hostnames.length > 0 ? hostnames : undefined;
}

function looksLikeValidationHostname(hostname: string): boolean {
  return hostname.includes("-validation.") || hostname.startsWith("validation.");
}

function runtimeLabel(status: Record<string, any>): string {
  const platform = `${status.runtime?.platform ?? "unknown"} ${status.runtime?.arch ?? ""}`.trim();
  const node = stringValue(status.runtime?.nodeVersion);
  return node ? `${platform} / ${node}` : platform;
}

function deploymentInfo(value: unknown): DeploymentInfo | undefined {
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as { id?: unknown; origin?: { kind?: unknown } };
    const id = stringValue(parsed.id);
    const kind = stringValue(parsed.origin?.kind);
    if (id) {
      return { raw: text, id, kind };
    }
  } catch {
    // Plain deployment ids are already displayable.
  }
  return /^[0-9]+$/.test(text) ? { raw: text, id: text } : { raw: text };
}

function deploymentHtml(info: DeploymentInfo | undefined): HtmlFragment | undefined {
  if (!info) {
    return undefined;
  }
  if (!info.id) {
    return withTitle(shortValue(info.raw), info.raw) as HtmlFragment;
  }
  const href = `https://hub.acurast.com/explorer/deployment/${encodeURIComponent(info.id)}`;
  const prefix = info.kind ? `${info.kind} deployment ` : "deployment ";
  const link = externalLinkHtml(href, info.id);
  return htmlFragment(
    `<span title="${escapeHtml(info.raw)}">${escapeHtml(prefix)}${link.__html}</span>`
  );
}

function assetHubBlockHtml(value: unknown): HtmlFragment | undefined {
  const block = scalarValue(value);
  if (!block) {
    return undefined;
  }
  return externalLinkHtml(`https://assethub-polkadot.subscan.io/block/${encodeURIComponent(block)}`, block);
}

function registrationTxSummary(registration: Record<string, any> | undefined): unknown {
  const tx = hashHtml(registration?.relayResponse?.txHash);
  if (tx) {
    return tx;
  }
  return registration?.state === "registered" ? "observed on-chain" : undefined;
}

function registrationBlockSummary(registration: Record<string, any> | undefined): unknown {
  const block = assetHubBlockHtml(registration?.relayResponse?.blockNumber);
  if (block) {
    return block;
  }
  return registration?.state === "registered" ? "not reported" : undefined;
}

function observabilityRelayLink(status: Record<string, any>): HtmlFragment | undefined {
  const relayUrl = stringValue(status.observability?.relayUrl);
  if (!relayUrl) {
    return undefined;
  }
  let label = relayUrl;
  try {
    label = new URL(relayUrl).host;
  } catch {
    // Keep the raw value if the relay source was not a URL.
  }
  return linkHtml(relayUrl, label, relayUrl);
}

function knownGatewayId(status: Record<string, any>): string | undefined {
  return stringValue(status.routing?.gatewayId) ?? stringValue(status.gatewayId) ?? stringValue(status.gateway?.gatewayId);
}

function optionalRow(label: string, value: unknown): Array<[string, unknown]> {
  return value === undefined || value === null || value === "" ? [] : [[label, value]];
}

function formatAddressList(addresses: unknown): HtmlFragment | undefined {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return undefined;
  }
  return lineListHtml(addresses
    .map((item) => {
      const record = item as Record<string, unknown>;
      const address = stringValue(record.address);
      const family = record.family ? `IPv${record.family}` : undefined;
      return [address, family].filter(Boolean).join(" ");
    })
    .filter(Boolean));
}

function observabilityPayload(status: Record<string, any>): Record<string, any> | undefined {
  const payload = status.observability?.payload ?? status.observability;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : undefined;
}

function routeMetricsPayload(status: Record<string, any>): Record<string, any> | undefined {
  const payload = observabilityPayload(status)?.routeMetrics ?? status.traffic?.routeMetrics;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : undefined;
}

function firstRouteMetricRow(status: Record<string, any>): Record<string, any> | undefined {
  const routes = routeMetricsPayload(status)?.routes;
  return Array.isArray(routes) && routes[0] && typeof routes[0] === "object" ? routes[0] : undefined;
}

function counterValue(metric: Record<string, any> | undefined, key: string): string | undefined {
  const value = metric?.counters?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function publicAddressesSummary(addresses: unknown, geoIp: Record<string, Record<string, unknown>>): unknown {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return undefined;
  }
  return addresses
    .map((item) => {
      const ip = stringValue(item);
      if (!ip) {
        return undefined;
      }
      const geo = geoIp[ip];
      const flag = stringValue(geo?.flag);
      if (!flag) {
        return ip;
      }
      const country = [stringValue(geo?.country), stringValue(geo?.countryCode)].filter(Boolean).join(" ");
      const title = country || ip;
      return htmlFragment(`<span class="public-address" title="${escapeHtml(title)}">${escapeHtml(ip)}<span class="country-flag">${escapeHtml(flag)}</span></span>`);
    })
    .filter(Boolean);
}

function geoIpPayload(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Record<string, unknown>>;
}

function formatBytes(value: unknown): string | undefined {
  const text = scalarValue(value);
  if (!text || !/^[0-9]+$/.test(text)) {
    return undefined;
  }
  const bytes = Number(text);
  if (!Number.isFinite(bytes)) {
    return `${text} B`;
  }
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = bytes / 1024;
  for (const unit of units) {
    if (current < 1024) {
      return `${current.toFixed(current >= 10 ? 1 : 2)} ${unit}`;
    }
    current /= 1024;
  }
  return `${current.toFixed(1)} PB`;
}

function dnsTargetSummary(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const targetIps = Array.isArray(record.targetIps)
    ? record.targetIps.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
    : [];
  if (targetIps.length > 0) {
    return targetIps;
  }
  return (
    stringValue(record.targetIp) ??
    stringValue(record.target) ??
    stringValue(record.address) ??
    stringValue(record.acceptedIp) ??
    stringValue(record.gatewayIp) ??
    stringValue(record.lastError) ??
    undefined
  );
}

function customerHostnamesSummary(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.available === false) {
    return stringValue(record.reason) ?? "unavailable";
  }
  const hostnames = Array.isArray(record.hostnames) ? record.hostnames : [];
  if (hostnames.length === 0) {
    return "none configured";
  }
  return hostnames
    .map((item) => {
      const row = item as Record<string, unknown>;
      return [stringValue(row.customerHostname), stringValue(row.status)].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function acmeRecordsSummary(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const hostnames = Array.isArray((value as Record<string, unknown>).hostnames)
    ? ((value as Record<string, unknown>).hostnames as unknown[])
    : [];
  if (hostnames.length === 0) {
    return "not applicable";
  }
  const records = hostnames.flatMap((item) => {
    const record = item as Record<string, any>;
    return [
      record.certificateValidation?.instructions?.summary,
      record.certificateValidation?.dns01Challenge?.name
    ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  });
  return records.length > 0 ? records : "none pending";
}

function validatorStateSummary(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.available === false) {
    return stringValue(record.reason) ?? "validator status unavailable";
  }
  const counts = validatorCounts(record);
  if ((counts.successes ?? 0) > 0) {
    return "healthy";
  }
  if ((counts.failures ?? 0) > 0 && (counts.reports ?? 0) > 0) {
    return "unhealthy";
  }
  const validators = record.validators;
  if (!Array.isArray(validators) || validators.length === 0) {
    if ((counts.enabledWork ?? counts.work ?? 0) > 0) {
      return "validator launch pending";
    }
    if ((counts.work ?? 0) === 0) {
      return "not scheduled";
    }
    return "no validator signal yet";
  }
  if (validators.some((item) => (item as Record<string, unknown>).status === "unhealthy")) {
    return "unhealthy";
  }
  if (validators.some((item) => (item as Record<string, unknown>).status === "healthy")) {
    return "healthy";
  }
  if ((counts.reports ?? 0) === 0) {
    return "awaiting first report";
  }
  return "reported";
}

function latestValidatorReportSummary(value: unknown, nowMs: number): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const summary = value as Record<string, unknown>;
  const latestReport = summary.latestReport;
  if (!latestReport || typeof latestReport !== "object" || Array.isArray(latestReport)) {
    const latestWorkReport = latestValidatorWorkReport(summary);
    if (latestWorkReport) {
      return htmlFragment([
        inlineHtml(stringValue(latestWorkReport.lastReportId) ?? stringValue(latestWorkReport.workId)),
        inlineHtml("received"),
        inlineHtml(formatDateTime(latestWorkReport.lastReportAt ?? latestWorkReport.lastCheckedAt, { nowMs })),
        latestWorkReport.lastSuccess === false ? inlineHtml("failed") : undefined
      ].filter(Boolean).join(" "));
    }
    const counts = validatorCounts(summary);
    if ((counts.enabledWork ?? counts.work ?? 0) > 0) {
      return "awaiting first report";
    }
    if ((counts.work ?? 0) === 0) {
      return "not scheduled";
    }
    return "none yet";
  }
  const record = latestReport as Record<string, unknown>;
  return htmlFragment([
    inlineHtml(stringValue(record.reportId)),
    inlineHtml("received"),
    inlineHtml(formatDateTime(record.receivedAt ?? record.checkedAt, { nowMs }))
  ].filter(Boolean).join(" "));
}

function validatorRowsSummary(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const summary = value as Record<string, unknown>;
  const validators = summary.validators;
  if (!Array.isArray(validators) || validators.length === 0) {
    const counts = validatorCounts(summary);
    if ((counts.reports ?? 0) > 0 || (counts.successes ?? 0) > 0 || (counts.reportedWork ?? 0) > 0) {
      return "reported via work packages";
    }
    if ((counts.enabledWork ?? counts.work ?? 0) > 0) {
      return "validator launch pending";
    }
    if ((counts.work ?? 0) === 0) {
      return "not scheduled";
    }
    return "none assigned yet";
  }
  const rows = validators.slice(0, 6).map((item) => {
    const record = item as Record<string, unknown>;
    return stringValue(record.validatorId);
  });
  return lineListHtml(rows);
}

function validatorCounts(summary: Record<string, unknown>): Record<string, number | undefined> {
  const counts = summary.counts && typeof summary.counts === "object" && !Array.isArray(summary.counts)
    ? summary.counts as Record<string, unknown>
    : {};
  const workRows = validatorWorkRows(summary);
  const reportRows = validatorReportRows(summary);
  const successfulWorkRows = workRows.filter((row) => row.lastSuccess === true);
  const failedWorkRows = workRows.filter((row) => row.lastSuccess === false);
  return {
    work: maxDefined(numberValue(counts.work), workRows.length),
    enabledWork: maxDefined(numberValue(counts.enabledWork), workRows.filter((row) => row.enabled !== false).length),
    reportedWork: maxDefined(numberValue(counts.reportedWork), reportRows.length),
    reports: maxDefined(numberValue(counts.reports), reportRows.length),
    successes: maxDefined(numberValue(counts.successes), successfulWorkRows.length),
    failures: maxDefined(numberValue(counts.failures), failedWorkRows.length),
    validators: numberValue(counts.validators)
  };
}

function validatorWorkRows(summary: Record<string, unknown>): Record<string, unknown>[] {
  const work = summary.work;
  return Array.isArray(work)
    ? work.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function validatorReportRows(summary: Record<string, unknown>): Record<string, unknown>[] {
  return validatorWorkRows(summary).filter((row) => Boolean(stringValue(row.lastReportId) ?? stringValue(row.lastReportAt) ?? stringValue(row.lastCheckedAt)));
}

function latestValidatorWorkReport(summary: Record<string, unknown>): Record<string, unknown> | undefined {
  return validatorReportRows(summary)
    .map((row) => ({
      row,
      at: timestampMs(row.lastReportAt ?? row.lastCheckedAt) ?? 0
    }))
    .sort((left, right) => right.at - left.at)[0]?.row;
}

function maxDefined(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return Math.max(left, right);
}

function formatDateTime(value: unknown, options: TimeRenderOptions = {}): HtmlFragment | string | undefined {
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }
  const iso = date.toISOString();
  const nowMs = options.nowMs ?? Date.now();
  const label = relativeTimeLabel(date.getTime() - nowMs, options.mode ?? "relative");
  return htmlFragment(`<time datetime="${escapeHtml(iso)}" title="${escapeHtml(iso)}">${escapeHtml(label)}</time>`);
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) {
    return plural(seconds, "sec");
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest > 0 ? `${plural(minutes, "min")} ${plural(rest, "sec")}` : plural(minutes, "min");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest > 0 ? `${plural(hours, "hr")} ${plural(rest, "min")}` : plural(hours, "hr");
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${plural(days, "day")} ${plural(rest, "hr")}` : plural(days, "day");
}

function relativeTimeLabel(diffMs: number, mode: TimeRenderOptions["mode"]): string {
  const amount = relativeAmount(Math.abs(diffMs));
  if (amount === "now") {
    return "now";
  }
  if (diffMs >= 0) {
    return mode === "expires" ? `expires in ${amount}` : `in ${amount}`;
  }
  return mode === "expires" ? `expired ${amount} ago` : `${amount} ago`;
}

function relativeAmount(absMs: number): string {
  if (absMs < 1_000) {
    return "now";
  }
  const seconds = Math.max(1, Math.round(absMs / 1_000));
  if (seconds < 60) {
    return plural(seconds, "sec");
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return plural(minutes, "min");
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return plural(hours, "hr");
  }
  return plural(Math.round(hours / 24), "day");
}

function plural(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function timestampMs(value: unknown): number | undefined {
  const text = stringValue(value);
  if (!text) {
    return undefined;
  }
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : undefined;
}

function inlineHtml(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (isHtmlFragment(value)) {
    return value.__html;
  }
  return escapeHtml(String(value));
}

function shortValue(value: string): string {
  if (/^0x[0-9a-fA-F]{24,}$/.test(value)) {
    return `${value.slice(0, 10)}...${value.slice(-8)}`;
  }
  if (value.length > 42) {
    return `${value.slice(0, 24)}...${value.slice(-14)}`;
  }
  return value;
}

function shortHostname(value: string): string {
  return value.length > 38 ? `${value.slice(0, 24)}...${value.slice(-14)}` : value;
}

function boolLabel(value: unknown): string {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "unknown";
}

function scalarValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return undefined;
}

function recordValue(value: unknown, name: string): Record<string, any> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[name];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, any> : undefined;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => stringValue(value)?.trim()).filter((value): value is string => Boolean(value)))];
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
