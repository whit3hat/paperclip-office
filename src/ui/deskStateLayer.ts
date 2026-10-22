import { Container, Graphics, Ticker } from "pixi.js";
import { useStore } from "../adapters/store.js";
import { getSeatAssignments, getSceneTileSize } from "./seatMap.js";
import { deskMarks, type DeskMark } from "./deskMarks.js";
import { INK_HEX } from "./stateColors.js";
import type { OfficeSettings } from "../shared/settings.js";

/** Below this the label layer hides itself (agentLabels.ZOOM_HIDE_BELOW), so the desk mark switches
 *  from a ring around the desk to a filled pad: at whole-floor zoom the state IS the desk. */
const SOLID_BELOW = 0.55;
const PULSE_SECONDS = 1.4;
const STATE_ALPHA = 0.44;
const ALERT_ALPHA_LOW = 0.45;
const ALERT_ALPHA_HIGH = 0.8;

let enabled = true;
let invalidate: (() => void) | null = null;

/** Shares the `stateRings` setting with the state ring under each character: both answer "show me
 *  each agent's state on the floor", and a second toggle for the same question would only let the
 *  two disagree. */
export function setDeskStateSettings(settings: Pick<OfficeSettings, "stateRings">): void {
  enabled = settings.stateRings;
  invalidate?.();
}

function drawMark(g: Graphics, m: DeskMark, ts: number, zoom: number, pulse: number): void {
  const x = m.tx * ts + 1;
  const y = m.ty * ts + 1;
  const size = ts - 2;
  // The marks live in the zoomed world, so counter-scale line weights: a 2px ring must still be
  // ~2 screen px when the camera is fitted to the whole floor, or the state vanishes at the one
  // zoom where you most want it.
  const comp = 1 / Math.min(zoom, 1);
  const ink = Math.max(1, comp * 0.8);
  const alert = m.emphasis === "alert";
  // Stuck always fills, at any zoom, and breathes between two alphas so it stands out from the
  // steady blocked red next to it.
  const solid = alert || zoom < SOLID_BELOW;

  if (solid) {
    const alpha = alert ? ALERT_ALPHA_LOW + (ALERT_ALPHA_HIGH - ALERT_ALPHA_LOW) * pulse : STATE_ALPHA;
    g.roundRect(x, y, size, size, 3).fill({ color: m.color, alpha });
  }
  // A dark edge on the outside and the state colour on the inside: the pair survives the pale oak
  // hall and the saturated department floors (gold on pink is the worst case on the free theme).
  g.roundRect(x, y, size, size, 3).stroke({ width: ink, color: INK_HEX, alpha: 0.55 });
  const ring = alert ? Math.max(2.5, comp * 2.5) : Math.max(2, comp * 2);
  const inset = ink + ring / 2;
  g.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, 2).stroke({
    width: ring,
    color: m.color,
    alpha: alert ? 1 : 0.95,
  });
}

/** State as desk colour: one tinted pad per occupied desk, under the characters and over the
 *  queue-depth heatmap rug, visible at every zoom including the whole-floor fit where the
 *  nameplates, issue tags and thought bubbles are all suppressed. Mounted once per floor by the
 *  Camera override. */
export function mountDeskState(world: Container): void {
  const layer = new Container();
  // Just above the heatmap rug (mounted first by the Camera override) and below the characters.
  world.addChildAt(layer, Math.min(2, world.children.length));
  const g = new Graphics();
  layer.addChild(g);

  let marks: DeskMark[] = [];
  let needsData = true;
  let needsDraw = true;
  let lastZoom = -1;
  let elapsed = 0;

  const refresh = () => {
    needsData = true;
    needsDraw = true;
  };
  invalidate = refresh;
  const unsubscribe = useStore.subscribe(refresh);

  const tick = (ticker: Ticker) => {
    elapsed += ticker.deltaMS / 1000;
    if (needsData) {
      const agents = enabled ? useStore.getState().agents : [];
      const seats = getSeatAssignments(agents.map((a) => ({ id: a.id, isChief: !!a.isGod })));
      marks = deskMarks(agents, seats);
      needsData = false;
    }
    const zoom = world.scale.x;
    if (zoom !== lastZoom) {
      lastZoom = zoom;
      needsDraw = true;
    }
    const pulsing = marks.some((m) => m.emphasis === "alert");
    if (!needsDraw && !pulsing) return;
    needsDraw = false;

    const ts = getSceneTileSize();
    // 0 → 1 → 0 triangle wave; a sine would need no more code but reads softer than a stuck desk should.
    const phase = (elapsed % PULSE_SECONDS) / PULSE_SECONDS;
    const pulse = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    g.clear();
    for (const m of marks) drawMark(g, m, ts, zoom > 0 ? zoom : 1, pulse);
  };

  Ticker.shared.add(tick);
  layer.once("destroyed", () => {
    Ticker.shared.remove(tick);
    unsubscribe();
    if (invalidate === refresh) invalidate = null;
  });
}
