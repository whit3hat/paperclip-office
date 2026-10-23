import { Container, Graphics, Text, Ticker } from "pixi.js";
import { useStore } from "../adapters/store.js";
import { applyBubbleBudget } from "./bubbleBudget.js";
import { resolveLabelRows, type LabelBox } from "./labelLayout.js";
import { INK_HEX, stateHex } from "./stateColors.js";
import { canvasFonts } from "./canvasFont.js";
import type { OfficeSettings } from "../shared/settings.js";

const TEXT_RESOLUTION = 5;
const RING_RADIUS = 9;
const ZOOM_HIDE_BELOW = 0.55;
const ZOOM_DETAIL = 1.5;
const NAME_PX = 10;
const TAG_PX = 9;
const TAG_GAP = 3;
/** Screen px between staggered nameplate rows. */
export const LABEL_ROW_HEIGHT = NAME_PX + 3;
const ROW_HEIGHT = LABEL_ROW_HEIGHT;

/** Anything with the two Character methods this layer needs; the real type is upstream's class.
 *  The rest are optional because only sceneSnapshot() reads them, and the fakes in the tests
 *  implement just the position. */
interface LiveCharacter {
  agentId: string;
  getPixelPosition(): { x: number; y: number };
  getDeskTile?(): { x: number; y: number };
  getTilePosition?(): { x: number; y: number };
}

const live = new Map<string, LiveCharacter>();

export function registerCharacter(agentId: string, character: LiveCharacter): void {
  live.set(agentId, character);
}

export function unregisterCharacter(agentId: string): void {
  live.delete(agentId);
}

/** How far through the walk-in the scene is, for the screenshot harness.
 *
 *  Every character spawns at the office door and walks to its desk, so a shot taken when the
 *  roster is merely *full* catches the whole company in a heap by the entrance with its
 *  nameplates and clouds stacked. `atDesk` climbs as they arrive and then plateaus; that plateau
 *  is the ready signal. It is deliberately not "everyone is seated" and not "the floor is still":
 *  neither ever happens, because idle characters roam and one waiting on a human paces.
 *  See scripts/screenshots.mjs. */
export function sceneSnapshot(): { total: number; atDesk: number } {
  let atDesk = 0;
  for (const c of live.values()) {
    const at = c.getTilePosition?.();
    const desk = c.getDeskTile?.();
    if (at && desk && at.x === desk.x && at.y === desk.y) atDesk++;
  }
  return { total: live.size, atDesk };
}

/** A plate drawn by someone other than this layer (the PA) that still has to take its turn in the
 *  overlap pass — the published close-up shows the PA's plate printed over Oliver's as "PAlliver". */
export interface ExtraLabel {
  id: string;
  rank: number;
  /** The sprite's world position and the plate's width in text pixels, or null while it is hidden. */
  measure(): { x: number; y: number; w: number } | null;
  place(slot: { row: number; visible: boolean }): void;
}

const extras = new Map<string, ExtraLabel>();

export function registerExtraLabel(label: ExtraLabel): void {
  extras.set(label.id, label);
}

export function unregisterExtraLabel(id: string): void {
  extras.delete(id);
}

let settings: Pick<OfficeSettings, "nameplates" | "issueTags" | "stateRings"> = {
  nameplates: true,
  issueTags: true,
  stateRings: true,
};

export function setAgentLabelSettings(s: Pick<OfficeSettings, "nameplates" | "issueTags" | "stateRings">): void {
  settings = s;
}

function label(size: number, color: number, font: string, weight: "bold" | "normal" = "bold"): Text {
  const t = new Text({
    text: "",
    style: {
      fontFamily: font,
      fontSize: size,
      fill: color,
      fontWeight: weight,
      // A dark halo, not an outline: a third of the font size (the old width) turned every plate
      // into a black slab. This is thin enough to read as type and still holds the light fill
      // against the pale oak hall and the saturated department floors.
      stroke: { color: INK_HEX, width: size / 6, alpha: 0.85 },
    },
  });
  t.resolution = TEXT_RESOLUTION;
  t.anchor.set(0.5, 0);
  return t;
}

const PLATE_MAX = 32;
const SHORT_MAX = 10;
const FILLER = new Set(["my", "the", "our", "a", "an", "&", "and"]);
const ABBREV: Record<string, string> = { documentation: "Docs", performance: "Perf", engineering: "Eng", engineer: "Eng", platform: "Platform", quality: "Quality", codebase: "Codebase", dispatch: "Dispatch" };

/** One or two words that tell agents apart on the canvas: "My Order Module Steward" -> "Order", "QA & Test Engineer" -> "QA Test". */
export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => !FILLER.has(w.toLowerCase()));
  if (words.length === 0) return name.slice(0, SHORT_MAX);
  const fix = (w: string) => ABBREV[w.toLowerCase()] ?? w;
  const first = fix(words[0]);
  const short = first.length <= 3 && words[1] ? `${first} ${fix(words[1])}` : first;
  return short.length > SHORT_MAX ? short.slice(0, SHORT_MAX) : short;
}

export function plateText(name: string, role: string): string {
  const sameAsName = !role || name.toLowerCase().includes(role.toLowerCase()) || role.toLowerCase().includes(name.toLowerCase());
  const full = sameAsName ? name : `${name} · ${role}`;
  return full.length > PLATE_MAX ? `${full.slice(0, PLATE_MAX - 1).trimEnd()}…` : full;
}

/** Stuck and blocked plates claim their spot first, then the chief, then everyone else. */
export function labelRank(status: string, stuck: boolean, isChief: boolean): number {
  if (stuck || status === "looping" || status === "blocked") return 0;
  if (isChief) return 1;
  if (status === "working" || status === "thinking" || status === "compacting") return 2;
  return 3;
}

interface Slot {
  container: Container;
  ring: Graphics;
  name: Text;
  /** Key + title, laid out in text pixels and scaled as a unit so the two faces stay kerned. */
  tag: Container;
  /** Issue key ("NWR-101"), the one thing on the canvas that stays monospace. */
  key: Text;
  title: Text;
  flag: Graphics;
  lastNameText: string;
  lastKeyText: string;
  lastTitleText: string;
}

function drawFlag(g: Graphics): void {
  g.moveTo(0, -18).lineTo(0, -9);
  g.stroke({ width: 0.8, color: 0x5a5a5a });
  g.moveTo(0, -18).lineTo(5, -16).lineTo(0, -14).closePath();
  g.fill(0xd9534f);
}

function makeSlot(): Slot {
  const container = new Container();
  const ring = new Graphics();
  const fonts = canvasFonts();
  const name = label(NAME_PX, 0xf4f4f4, fonts.ui);
  const key = label(TAG_PX, 0xffd166, fonts.mono);
  const title = label(TAG_PX, 0xe8e8e8, fonts.ui, "normal");
  key.anchor.set(0, 0);
  title.anchor.set(0, 0);
  const tag = new Container();
  tag.addChild(key, title);
  const flag = new Graphics();
  drawFlag(flag);
  container.addChild(ring, name, tag, flag);
  return { container, ring, name, tag, key, title, flag, lastNameText: "", lastKeyText: "", lastTitleText: "" };
}

const TAG_TITLE_MAX = 22;

/** Nameplates, issue tags and state rings that follow each agent's live sprite; mounted once
 *  per floor by the Camera override, alongside the heatmap and the wall plaque. */
export function mountAgentLabels(world: Container): void {
  const layer = new Container();
  world.addChild(layer);
  const slots = new Map<string, Slot>();

  const tick = () => {
    const agents = useStore.getState().agents;
    const seen = new Set<string>();
    const zoom = world.scale.x;
    const tooSmall = zoom < ZOOM_HIDE_BELOW;
    const detail = zoom >= ZOOM_DETAIL;
    const textScale = 1 / zoom;

    // Thought clouds are capped and prioritised from here: this is the one pass per frame that
    // already knows both the camera zoom and the live agent list.
    applyBubbleBudget(
      agents.map((a) => ({ id: a.id, status: String(a.status ?? "idle"), stuck: Boolean((a as { stuck?: unknown }).stuck) })),
      zoom,
    );

    for (const a of agents) {
      const character = live.get(a.id);
      if (!character) continue;
      seen.add(a.id);
      let slot = slots.get(a.id);
      if (!slot) {
        slot = makeSlot();
        slots.set(a.id, slot);
        layer.addChild(slot.container);
      }

      const pos = character.getPixelPosition();
      slot.container.position.set(pos.x, pos.y);
      slot.container.visible = !tooSmall;
      if (tooSmall) continue;

      slot.ring.visible = settings.stateRings;
      if (settings.stateRings) {
        slot.ring.clear();
        const color = stateHex(String(a.status ?? "idle"), Boolean((a as { stuck?: unknown }).stuck) || a.status === "looping");
        slot.ring.ellipse(0, 2, RING_RADIUS, RING_RADIUS / 3).stroke({ width: 1.4, color, alpha: 0.9 });
      }

      const scores = (a as { scores?: { flag?: string | null } | null }).scores;
      slot.flag.visible = Boolean(scores?.flag);

      if (settings.nameplates) {
        const text = shortName(a.name);
        if (text !== slot.lastNameText) {
          slot.name.text = text;
          slot.lastNameText = text;
        }
        slot.name.scale.set(textScale);
      }

      const issueLabel = (a as { issueLabel?: unknown }).issueLabel;
      const issueTitle = (a as { issueTitle?: unknown }).issueTitle;
      const showTag = settings.issueTags && typeof issueLabel === "string" && a.status !== "idle" && a.status !== "waiting" && a.status !== "ghost" && detail;
      slot.tag.visible = showTag;
      if (showTag) {
        if (issueLabel !== slot.lastKeyText) {
          slot.key.text = issueLabel;
          slot.lastKeyText = issueLabel;
        }
        const raw = typeof issueTitle === "string" ? issueTitle : "";
        const text = raw.length > TAG_TITLE_MAX ? `${raw.slice(0, TAG_TITLE_MAX - 1).trimEnd()}…` : raw;
        if (text !== slot.lastTitleText) {
          slot.title.text = text;
          slot.lastTitleText = text;
        }
        // Inside the tag container everything is text pixels; the container carries the zoom.
        slot.tag.scale.set(textScale);
        const total = slot.key.width + (text ? TAG_GAP + slot.title.width : 0);
        slot.key.position.set(-total / 2, 0);
        slot.title.position.set(-total / 2 + slot.key.width + TAG_GAP, 0);
      }
    }

    // Deconflict the plates in SCREEN pixels: a plate is counter-scaled to 1/zoom, so its world
    // width times the zoom is exactly its text width in screen pixels.
    const boxes: LabelBox[] = [];
    for (const a of agents) {
      const slot = slots.get(a.id);
      const pos = live.get(a.id)?.getPixelPosition();
      if (!slot || !pos || tooSmall || !settings.nameplates) continue;
      const stuck = Boolean((a as { stuck?: unknown }).stuck);
      const status = String(a.status ?? "idle");
      const w = slot.name.width * zoom;
      boxes.push({
        id: a.id,
        x: pos.x * zoom - w / 2,
        y: pos.y * zoom,
        w,
        h: NAME_PX,
        rank: labelRank(status, stuck, Boolean(a.isGod)),
      });
    }
    const measured = new Map<string, ExtraLabel>();
    for (const extra of extras.values()) {
      const m = tooSmall ? null : extra.measure();
      if (!m) {
        extra.place({ row: 0, visible: false });
        continue;
      }
      measured.set(extra.id, extra);
      boxes.push({ id: extra.id, x: m.x * zoom - m.w / 2, y: m.y * zoom, w: m.w, h: NAME_PX, rank: extra.rank });
    }

    const rows = resolveLabelRows(boxes, ROW_HEIGHT);
    for (const [id, extra] of measured) extra.place(rows.get(id) ?? { row: 0, visible: false });
    for (const a of agents) {
      const slot = slots.get(a.id);
      if (!slot) continue;
      const row = rows.get(a.id);
      const visible = settings.nameplates && !tooSmall && Boolean(row?.visible);
      slot.name.visible = visible;
      const dy = 5 + (row?.row ?? 0) * ROW_HEIGHT;
      slot.name.position.set(0, dy * textScale);
      slot.tag.position.set(0, (visible ? dy + NAME_PX + 2 : 5) * textScale);
    }

    for (const [id, slot] of slots) {
      if (seen.has(id)) continue;
      slot.container.destroy({ children: true });
      slots.delete(id);
    }
  };

  Ticker.shared.add(tick);
  layer.once("destroyed", () => Ticker.shared.remove(tick));
}
