import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { renderDemoPage } from "../dist/demo-page.js";

const fixturePath = path.resolve(process.argv[2] ?? "tests/fixtures/observability-status.json");
const status = JSON.parse(await readFile(fixturePath, "utf8"));
const htmlPath = path.join(tmpdir(), "switchboard-express-demo.html");
await writeFile(htmlPath, renderDemoPage(status, {
  client: {
    ip: "203.0.113.42",
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.6312.86 Safari/537.36"
  }
}));

const chrome = process.env.CHROME_BIN ?? findChrome();
if (!chrome) {
  console.log(`Rendered ${htmlPath}`);
  console.log("Chrome not found; set CHROME_BIN or install google-chrome/chromium to capture screenshots.");
  process.exit(0);
}

const profileDir = await mkdtemp(path.join(tmpdir(), "switchboard-chrome-"));
for (const capture of [
  { name: "desktop", size: "1440,1600" },
  { name: "mobile", size: "390,1200" }
]) {
  const screenshotPath = path.join(tmpdir(), `switchboard-express-demo-${capture.name}.png`);
  const result = spawnSync(chrome, [
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${profileDir}`,
    `--window-size=${capture.size}`,
    `--screenshot=${screenshotPath}`,
    pathToFileURL(htmlPath).href
  ], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Chrome screenshot failed for ${capture.name}\n${result.stdout}\n${result.stderr}`);
  }
  console.log(`Wrote ${screenshotPath}`);
}

console.log(`Rendered ${htmlPath}`);

function findChrome() {
  for (const candidate of [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  const result = spawnSync("which", ["google-chrome"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}
