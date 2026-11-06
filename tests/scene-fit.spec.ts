import { beforeEach, describe, expect, it } from "vitest";
import { generateOfficeMap } from "../src/layout/generate.js";
import { scandiPalette } from "../src/layout/styles/scandi.js";
import { LAYOUT_PRESETS } from "../src/layout/presets.js";
import { fitSceneBox, getFloorAspect, reportFloorSize, resetFloorAspect, subscribeFloorAspect } from "../src/ui/sceneFit.js";

// The floor is only as wide as the company makes it: three agents on the compact preset is 17x24
// tiles (aspect 0.71) and six departments is 66x29 (aspect 2.28). The page used to hand both the
// same ~1.7 box, so one letterboxed top and bottom and the other left and right. No browser is
// needed to prove the fit — the generator is deterministic, so the real map sizes come from it.

const PAGE = 1248; // the content column at the 1440x900 the screenshot harness shoots
const GUTTER = 220; // ROSTER_WIDTH: the roster overlays the box, it does not share the floor's viewport
const MAX_HEIGHT = 612; // 68vh of 900
const MIN_HEIGHT = 320;

const depts = (sizes: number[]) => sizes.map((n, i) => ({ name: `d${i}`, agentIds: Array.from({ length: n }, (_, k) => `a${i}-${k}`) }));

const COMPANIES: Record<string, number[]> = {
  "3 agents": [1, 2],
  "30 agents": [1, 8, 7, 6, 5, 3],
};

/** Share of the floor's viewport that upstream's fit-to-screen leaves as dead canvas. */
function deadBand(box: { width: number; height: number }, map: { width: number; height: number }): number {
  const view = { w: box.width - GUTTER, h: box.height };
  const zoom = Math.min(view.w / map.width, view.h / map.height);
  return 1 - (map.width * zoom * map.height * zoom) / (view.w * view.h);
}

describe("fitSceneBox", () => {
  const palette = scandiPalette();

  for (const [label, sizes] of Object.entries(COMPANIES))
    for (const { id, spec } of LAYOUT_PRESETS) {
      const map = generateOfficeMap(depts(sizes), palette, spec).map;
      const box = fitSceneBox({ available: PAGE, aspect: map.width / map.height, gutter: GUTTER, minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT });

      it(`${label} on ${id}: the floor fills the canvas`, () => {
        // Rounding to whole pixels is allowed; a band is not.
        expect(deadBand(box, map)).toBeLessThan(0.005);
      });

      it(`${label} on ${id}: the box stays inside the page`, () => {
        expect(box.width).toBeLessThanOrEqual(PAGE);
        expect(box.height).toBeLessThanOrEqual(MAX_HEIGHT);
        expect(box.height).toBeGreaterThanOrEqual(MIN_HEIGHT);
      });
    }

  it("gives width back rather than stretching a narrow floor", () => {
    // A one-room company is taller than it is wide: the box narrows and the page shows background
    // beside it, instead of the office frame holding empty canvas.
    const box = fitSceneBox({ available: PAGE, aspect: 0.708, gutter: GUTTER, minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT });
    expect(box.height).toBe(MAX_HEIGHT);
    expect(box.width - GUTTER).toBe(Math.round(MAX_HEIGHT * 0.708));
    expect(box.width).toBeLessThan(PAGE);
  });

  it("spends the whole page on a wide floor and gets shorter", () => {
    const box = fitSceneBox({ available: PAGE, aspect: 2.276, gutter: GUTTER, minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT });
    expect(box.width).toBe(PAGE);
    expect(box.height).toBe(Math.round((PAGE - GUTTER) / 2.276));
    expect(box.height).toBeLessThan(MAX_HEIGHT);
  });

  it("keeps the office readable on a page too narrow to fit a wide floor", () => {
    // The one case that still bands, and deliberately: below minHeight the characters stop being
    // legible, which costs more than the band saves.
    const box = fitSceneBox({ available: 600, aspect: 2.276, gutter: GUTTER, minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT });
    expect(box.width).toBe(600);
    expect(box.height).toBe(MIN_HEIGHT);
  });

  it("survives a zero-width page", () => {
    const box = fitSceneBox({ available: 0, aspect: 1.8, gutter: GUTTER, minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT });
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBe(MIN_HEIGHT);
  });
});

describe("floor aspect reporting", () => {
  beforeEach(resetFloorAspect);

  it("is null until a floor mounts, so the page keeps its unfitted box", () => {
    expect(getFloorAspect()).toBeNull();
  });

  it("tells the page when the map changes size, and only then", () => {
    let calls = 0;
    const off = subscribeFloorAspect(() => calls++);
    reportFloorSize(1056, 464);
    expect(getFloorAspect()).toBeCloseTo(1056 / 464, 10);
    expect(calls).toBe(1);
    reportFloorSize(1056, 464);
    expect(calls).toBe(1);
    reportFloorSize(528, 384);
    expect(calls).toBe(2);
    off();
    reportFloorSize(1056, 464);
    expect(calls).toBe(2);
  });

  it("ignores a map with no size", () => {
    reportFloorSize(0, 0);
    expect(getFloorAspect()).toBeNull();
  });
});
