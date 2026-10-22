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
 *  id breaking ties so the choice is stable frame to frame and company to company. */
export function chooseBubbles(candidates: BubbleCandidate[], zoom: number): Set<string> {
  const ranked = candidates
    .map((c) => ({ id: c.id, rank: bubbleRank(String(c.status ?? "idle"), Boolean(c.stuck)) }))
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return new Set(ranked.slice(0, bubbleCap(zoom)).map((r) => r.id));
}

/** The bit of a live Character the budget drives. */
export interface BubbleHolder {
  wantsBubble(): boolean;
  allowBubble(on: boolean): void;
}

const holders = new Map<string, BubbleHolder>();

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
    if (!holder.wantsBubble()) continue;
    wanting.push(byId.get(id) ?? { id });
  }
  const allowed = chooseBubbles(wanting, zoom);
  for (const [id, holder] of holders) holder.allowBubble(allowed.has(id));
}
