// The canvas is sized to the floor, instead of the floor being fitted into whatever box the page
// happened to have.
//
// Upstream's Camera fits with min(view/map) and centres, so whatever the shorter axis does not use
// stays as dead canvas. The generated floor's aspect is a function of the company — about 0.7 for a
// one-room team on the compact preset, about 2.3 for five departments side by side — while the page
// handed the scene a fixed ~1.7 box. There was always a band, and at the extremes it was most of the
// canvas. Give the box the floor's own aspect and both axes bind at once, so fit-to-screen has
// nothing left to letterbox.
//
// The floor reports its size rather than the page recomputing it: Camera.setMapSize carries the map
// that was actually built, so this holds for the generated floor, the fixed upstream map and any
// later theme, with no second copy of the generator's arithmetic to keep in step.

/** Box for the scene section, in CSS pixels. */
export interface SceneBox {
  width: number;
  height: number;
}

export interface FitInput {
  /** Width the page can give the scene section. */
  available: number;
  /** Floor width / height. Tiles are square, so tile counts work as well as pixels. */
  aspect: number;
  /** Width the roster takes inside the box: it overlays the box, not the floor's viewport. */
  gutter: number;
  /** Below this the office is too small to read, and a band is the lesser evil. */
  minHeight: number;
  /** The page keeps the scene above the fold; the floor never grows past this. */
  maxHeight: number;
}

/** The box whose floor viewport has the floor's own aspect: the whole floor, no dead band.
 *
 *  Width is given back rather than kept — a nearly square floor in a wide page yields a narrower
 *  box centred on the page, so the unused space is page background instead of empty canvas inside
 *  a framed office. A band only returns when `minHeight` binds, which needs a page too narrow to
 *  show a wide floor at a readable size at all. */
export function fitSceneBox({ available, aspect, gutter, minHeight, maxHeight }: FitInput): SceneBox {
  const widest = Math.max(1, available - gutter);
  const floorWidth = Math.min(widest, maxHeight * aspect);
  return { width: Math.round(floorWidth + gutter), height: Math.round(Math.max(minHeight, floorWidth / aspect)) };
}

let aspect: number | null = null;
const listeners = new Set<() => void>();

/** Called by our Camera override once the floor's map exists. */
export function reportFloorSize(width: number, height: number): void {
  if (!(width > 0) || !(height > 0)) return;
  const next = width / height;
  if (next === aspect) return;
  aspect = next;
  for (const fn of [...listeners]) fn();
}

/** null until a floor has mounted: the page keeps its unfitted box, so an error or empty state
 *  looks exactly as it did before. */
export function getFloorAspect(): number | null {
  return aspect;
}

export function subscribeFloorAspect(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Tests only: the aspect is module state, and one spec's floor must not leak into the next. */
export function resetFloorAspect(): void {
  aspect = null;
}
