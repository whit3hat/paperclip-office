// Renders demo/dist in a headless browser and writes the docs/screenshots set.
//
// The scene is not ready when the page loads — the bundle has to build the floor and decode a
// sprite sheet per character — so each shot waits for the roster to finish appearing (see ready()).
//
// Usage: node scripts/screenshots.mjs [name ...]      (no names = the whole set)
//   PUPPETEER=<path>  resolve puppeteer from outside this repo (it is not a dependency here)
//   OUT=<dir>         write somewhere other than docs/screenshots
//
// It needs a Chrome and the system libraries Chrome links; on a bare box see docs/screenshots.md.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const OUT = resolve(process.env.OUT || "docs/screenshots");
const ROOT = resolve("demo/dist");
const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".map": "application/json", ".png": "image/png" };

function serve() {
  const server = createServer(async (req, res) => {
    const path = (req.url || "/").split("?")[0];
    // The type comes from the resolved file, not the request path: "/" has no extension, and
    // serving index.html as octet-stream makes Chrome download it (ERR_ABORTED) instead of render.
    const file = path === "/" ? "index.html" : path;
    try {
      const body = await readFile(join(ROOT, file));
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** Resolves once the walk-in is over.
 *
 *  Do not wait for a still floor — it never comes, and that is correct: an agent waiting on a
 *  human paces at the door, idle roaming wanders a few more, and even a seated character shifts
 *  about half a tile between samples. Nor is a full roster the signal: every character spawns at
 *  the office door and *then* walks to its desk, so shooting when the roster stops growing
 *  catches the whole company in a heap by the entrance, nameplates and clouds stacked. That is
 *  the shot this harness existed to avoid.
 *
 *  So wait on the count of characters standing on their own desk tile. It climbs during the
 *  walk-in and plateaus when it is done. The plateau is what we want, not a particular count:
 *  the pacer and the roamers never arrive, so `atDesk` settles below `total` and that is correct.
 *
 *  Software GL makes this slow, which is where the numbers come from. Pixi clamps elapsed time
 *  per frame, so at SwiftShader's frame rate the characters cross the floor in slow motion. On
 *  the box these were measured on, 23 characters took ~90s before the *first* one reached a desk
 *  and were still arriving at 3.5 minutes, in bursts up to 14s apart. Hence a plateau long
 *  enough to sit through those gaps, and a budget in minutes.
 *
 *  `atDesk > 0` is required before a plateau counts: otherwise the long flat run at zero while
 *  everyone is still crossing the floor reads as settled, and we shoot the heap. */
async function ready(page, { samples = 8, every = 3000, graceMs = 4000, budgetMs = 600_000 } = {}) {
  const snap = () => page.evaluate(() => window.__officeScene?.() ?? { total: 0, atDesk: 0 });
  const deadline = Date.now() + budgetMs;
  let last = -1;
  let steady = 0;
  let empty = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, every));
    const { total, atDesk } = await snap();
    // The widget shot has no floor at all. Don't spend the walk-in budget waiting for one.
    if (total === 0 && ++empty >= samples) return true;
    steady = atDesk > 0 && atDesk === last ? steady + 1 : 0;
    last = atDesk;
    if (steady >= samples) {
      await new Promise((r) => setTimeout(r, graceMs));
      return true;
    }
  }
  console.warn(`screenshots: walk-in never settled (${last} at desks), shooting anyway`);
  return false;
}

async function click(page, label) {
  await page.evaluate((l) => document.querySelector(`[aria-label="${l}"]`)?.click(), label);
  await new Promise((r) => setTimeout(r, 1200));
}

const SHOTS = {
  office: {
    query: "",
    async prepare(page) {
      await click(page, "Whole floor");
    },
  },
  "office-closeup": {
    query: "",
    async prepare(page) {
      await click(page, "Whole floor");
      for (let i = 0; i < 3; i++) await click(page, "Zoom in");
    },
  },
  "agent-monitor": { query: "?agent=eng-4" },
  decisions: { query: "?open=decisions" },
  widget: { query: "?widget=1", clip: { x: 0, y: 0, width: 812, height: 524 } },
};

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(SHOTS);
for (const name of names) if (!SHOTS[name]) throw new Error(`unknown shot: ${name}`);

const puppeteer = (await import(process.env.PUPPETEER || "puppeteer")).default;
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(OUT, { recursive: true });

const launch = () =>
  puppeteer.launch({
    headless: "shell",
    args: ["--no-sandbox", "--disable-frame-rate-limit", "--disable-gpu-vsync", "--hide-scrollbars"],
  });

try {
  for (const name of names) {
    const shot = SHOTS[name];
    // A browser per shot, not a page per shot. Closing the page does not give back everything the
    // last floor took: under SwiftShader the second office shot in a shared browser crawled badly
    // enough that nobody reached a desk inside the ten-minute budget, and it shot the walk-in heap
    // it was built to avoid. A fresh process costs a couple of seconds against a five-minute
    // render, and every shot then gets the same clean box as the first.
    const browser = await launch();
    try {
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      await page.goto(base + shot.query, { waitUntil: "load" });
      const settled = await ready(page);
      if (shot.prepare) await shot.prepare(page);
      await page.screenshot({ path: join(OUT, `${name}.png`), clip: shot.clip });
      console.log(`screenshots: ${name}.png${settled ? "" : "  (NOT SETTLED - do not publish)"}`);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
