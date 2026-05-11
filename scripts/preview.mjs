import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderDemoPage } from "../dist/demo-page.js";

const args = parseArgs(process.argv.slice(2));
const host = args.host ?? "127.0.0.1";
const port = Number(args.port ?? process.env.PORT ?? "8787");
const fixturePath = path.resolve(args.fixture ?? "tests/fixtures/observability-status.json");

let status = await readStatusFixture();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${host}:${port}`);
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(renderDemoPage(status));
      return;
    }
    if (url.pathname === "/status") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(`${JSON.stringify(status, null, 2)}\n`);
      return;
    }
    if (url.pathname === "/__reload") {
      status = await readStatusFixture();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(`${JSON.stringify({ ok: true, fixture: fixturePath })}\n`);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  }
});

server.listen(port, host, () => {
  console.log(`Switchboard Express demo preview: http://${host}:${port}/`);
  console.log(`Fixture: ${fixturePath}`);
  console.log(`Reload fixture without restart: http://${host}:${port}/__reload`);
});

async function readStatusFixture() {
  const parsed = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Fixture must be a JSON object: ${fixturePath}`);
  }
  return parsed;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--") {
      continue;
    }
    if (value === "--host") {
      parsed.host = requiredArg(values[++index], value);
    } else if (value === "--port") {
      parsed.port = requiredArg(values[++index], value);
    } else if (value === "--fixture") {
      parsed.fixture = requiredArg(values[++index], value);
    } else if (value === "--help" || value === "-h") {
      console.log("Usage: npm run preview -- [--port 8787] [--fixture tests/fixtures/observability-status.json]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return parsed;
}

function requiredArg(value, name) {
  if (!value) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
}
