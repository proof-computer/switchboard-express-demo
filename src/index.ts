import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import express, { type Application } from "express";
import {
  serveSwitchboardExpress,
  type ServeSwitchboardExpressOptions,
  type SwitchboardExpressServer
} from "@proofcomputer/switchboard-express";

export interface SwitchboardExpressDemoOptions extends ServeSwitchboardExpressOptions {
  title?: string;
}

export function createSwitchboardExpressDemoApp(options: { title?: string } = {}): Application {
  const title = options.title ?? "Switchboard Express Demo";
  const app = express();

  app.get("/", (_request, response) => {
    response.type("html").send(demoPage(title));
  });

  return app;
}

export async function startSwitchboardExpressDemo(
  options: SwitchboardExpressDemoOptions = {}
): Promise<SwitchboardExpressServer> {
  const app = createSwitchboardExpressDemoApp({ title: options.title });
  return serveSwitchboardExpress(app, options);
}

function demoPage(title: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #f8fafc; }
      main { width: min(680px, calc(100vw - 48px)); }
      h1 { margin: 0 0 12px; font-size: clamp(34px, 7vw, 68px); line-height: 1; letter-spacing: 0; }
      p { margin: 0; font-size: 18px; line-height: 1.6; color: #cbd5e1; }
      code { color: #93c5fd; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>Served from an Acurast job through Switchboard. Health is available at <code>/health</code>.</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isMainModule(): boolean {
  if (!process.argv[1]) {
    return false;
  }
  const currentFile = fileURLToPath(import.meta.url);
  try {
    return realpathSync(process.argv[1]) === realpathSync(currentFile);
  } catch {
    return process.argv[1] === currentFile;
  }
}

if (isMainModule()) {
  startSwitchboardExpressDemo().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
