/** How many thought clouds may be on screen at once. Upstream stacks overlapping bubbles upward
 *  (OfficeFloor's resolveBubbleOverlaps) but has nowhere left to go once the stack hits the top of
 *  the world, where setPosition clamps them all back into one pile. Capping the count is the fix
 *  the issue asks for: a few readable clouds beat a wall of them. */
export const BUBBLE_CAP = 8;
/** At whole-floor zoom the clouds counter-scale to stay legible, so they cover most of the floor.
 *  Only the ones that mean something keep talking. */
export const BUBBLE_CAP_FAR = 3;
export const BUBBLE_FAR_ZOOM = 0.55;

export interface BubbleCandidate {
  id: string;
  status?: string;
  stuck?: boolean;
  /** Where the cloud would hang, in world px (the character's feet). Omit to skip the rect pass. */
  x?: number;
  y?: number;
  /** The pending thought, used to size the rect before the cloud exists. */
  text?: string;
}

export interface BubbleRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Geometry mirrored from vendor ThoughtBubble.ts, which does not export it. The numbers only set
// how much room a cloud is assumed to need, so a small drift after an upstream sync costs a little
// packing accuracy rather than correctness — but keep them in step. See upstream/overrides.md.
const BUBBLE_MAX_W = 150;
const BUBBLE_FONT_SIZE = 12;
const BUBBLE_PAD_X = 6;
const BUBBLE_PAD_Y = 3;
const BUBBLE_RENDER_SCALE = 0.5;
const BUBBLE_OFFSET_Y = -38;
const BUBBLE_MAX_CHARS = 160;
const BUBBLE_WRAP_W = BUBBLE_MAX_W / BUBBLE_RENDER_SCALE - BUBBLE_PAD_X * 2;
/** Mean advance of the canvas face at FONT_SIZE. Estimated, because measuring means a Text. */
const BUBBLE_CHAR_W = BUBBLE_FONT_SIZE * 0.55;
const BUBBLE_LINE_H = BUBBLE_FONT_SIZE * 1.2;

/** The world rect a cloud for `text` would occupy above (`x`,`y`) at this zoom.
 *
 *  Estimated from the text rather than read back from the live bubble on purpose. `getLayout` only
 *  answers while the cloud is on screen, so gating visibility on it oscillates: hide the loser, it
 *  reports no rect, it stops losing, it shows again. Sizing from the pending text is the same
 *  answer whether or not the cloud is currently up, so the pass is stable frame to frame. */
export function estimateBubbleRect(text: string, x: number, y: number, zoom: number): BubbleRect {
  const chars = Math.min(text.trim().length, BUBBLE_MAX_CHARS);
  const ideal = Math.max(1, chars) * BUBBLE_CHAR_W;
  const lines = Math.max(1, Math.ceil(ideal / BUBBLE_WRAP_W));
  const bgW = Math.min(ideal, BUBBLE_WRAP_W) + BUBBLE_PAD_X * 2;
  const bgH = lines * BUBBLE_LINE_H + BUBBLE_PAD_Y * 2;
  // The cloud counter-scales to hold its screen size while the camera zooms out, so it eats more
  // world the further out you are — which is exactly when the floor is most crowded.
  const comp = 1 / Math.min(zoom > 0 ? zoom : 1, 1);
  const w = bgW * BUBBLE_RENDER_SCALE * comp;
  const h = bgH * BUBBLE_RENDER_SCALE * comp;
  return { x: x - w / 2, y: y + BUBBLE_OFFSET_Y - h, w, h };
}

function rectsOverlap(a: BubbleRect, b: BubbleRect, pad: number): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/** Lower keeps its cloud when the floor is over budget. */
export function bubbleRank(status: string, stuck: boolean): number {
  if (stuck || status === "looping" || status === "blocked") return 0;
  if (status === "working" || status === "thinking" || status === "compacting") return 1;
  return 2;
}

export function bubbleCap(zoom: number): number {
  return zoom < BUBBLE_FAR_ZOOM ? BUBBLE_CAP_FAR : BUBBLE_CAP;
}

/** The agents allowed to show a cloud this frame: the ones that want one, most urgent first, agent
 *  id breaking ties so the choice is stable frame to frame and company to company.
 *
 *  Two gates, because the count alone was not enough. The cap keeps the floor from filling up, but
 *  characters bunch — several walk in together, idle ones roam to the same corner, and the one
 *  waiting on a human paces by the door. Bunched characters hang their clouds at nearly the same
 *  anchor, so a floor well under the cap still piles. Upstream lifts overlapping clouds upward, and
 *  that works until the stack reaches the top of the world, where setPosition clamps them into one
 *  heap. So each cloud also claims its rect, in the same priority order, and a cloud that cannot
 *  find clear ground stays down rather than landing on a neighbour. */
export function chooseBubbles(candidates: BubbleCandidate[], zoom: number, pad = 2): Set<string> {
  const ranked = [...candidates]
    .map((c) => ({ c, rank: bubbleRank(String(c.status ?? "idle"), Boolean(c.stuck)) }))
    .sort((a, b) => a.rank - b.rank || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));

  const cap = bubbleCap(zoom);
  const claimed: BubbleRect[] = [];
  const allowed = new Set<string>();
  for (const { c } of ranked) {
    if (allowed.size >= cap) break;
    // No geometry (a caller that only cares about the cap, or a character with no position yet):
    // the rect pass has nothing to say, so the cap decides alone.
    if (c.x === undefined || c.y === undefined) {
      allowed.add(c.id);
      continue;
    }
    const rect = estimateBubbleRect(c.text ?? "", c.x, c.y, zoom);
    if (claimed.some((r) => rectsOverlap(rect, r, pad))) continue;
    claimed.push(rect);
    allowed.add(c.id);
  }
  return allowed;
}

/** The bit of a live Character the budget drives. */
export interface BubbleHolder {
  wantsBubble(): boolean;
  allowBubble(on: boolean): void;
  /** Where the cloud would hang and what it would say, for the rect pass. Optional: a holder that
   *  cannot answer is simply packed on the cap alone. */
  bubbleAnchor?(): { x: number; y: number } | null;
  bubbleText?(): string;
}

const holders = new Map<string, BubbleHolder>();
let yielding: string | null = null;

/** One agent that must stay quiet whatever its rank — the PA is standing at its desk asking it a
 *  question, and two clouds over one desk is the pile this cap exists to stop. */
export function setBubbleYield(agentId: string | null): void {
  yielding = agentId;
}

export function registerBubbleHolder(agentId: string, holder: BubbleHolder): void {
  holders.set(agentId, holder);
}

export function unregisterBubbleHolder(agentId: string): void {
  holders.delete(agentId);
}

/** Called once a frame from the label layer (which already has the camera zoom and the store). */
export function applyBubbleBudget(agents: BubbleCandidate[], zoom: number): void {
  if (holders.size === 0) return;
  const byId = new Map(agents.map((a) => [a.id, a]));
  const wanting: BubbleCandidate[] = [];
  for (const [id, holder] of holders) {
    if (!holder.wantsBubble() || id === yielding) continue;
    // The store knows the agent's state; only the live sprite knows where it is standing and what
    // it is about to say. The rect pass needs both, so merge them here.
    const anchor = holder.bubbleAnchor?.() ?? null;
    wanting.push({ ...(byId.get(id) ?? { id }), ...(anchor ?? {}), text: holder.bubbleText?.() });
  }
  const allowed = chooseBubbles(wanting, zoom);
  for (const [id, holder] of holders) holder.allowBubble(allowed.has(id));
}
