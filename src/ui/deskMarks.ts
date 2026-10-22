import { stateHex } from "./stateColors.js";

/** How loudly a desk is marked.
 *  - `alert`  stuck: the one state that must read at every zoom, so it also pulses.
 *  - `state`  live state worth seeing from across the floor (working, thinking, blocked, …).
 *  - `none`   nothing to say; an unmarked desk reads as idle/at rest. */
export type DeskEmphasis = "none" | "state" | "alert";

export interface DeskAgent {
  id: string;
  status?: string;
  stuck?: boolean;
}

export interface DeskMark {
  agentId: string;
  /** Desk tile, in tiles. */
  tx: number;
  ty: number;
  color: number;
  emphasis: DeskEmphasis;
}

const QUIET = new Set(["idle", "waiting", "ghost"]);

export function deskEmphasis(status: string, stuck: boolean): DeskEmphasis {
  if (stuck || status === "looping") return "alert";
  if (QUIET.has(status)) return "none";
  return "state";
}

/** One mark per seated agent with something to show, in a stable order (agent id) so the same
 *  company always draws the same floor. Agents with no desk tile, or nothing to say, are left out. */
export function deskMarks(agents: DeskAgent[], seats: Map<string, { x: number; y: number }>): DeskMark[] {
  const marks: DeskMark[] = [];
  for (const a of agents) {
    const tile = seats.get(a.id);
    if (!tile) continue;
    const status = String(a.status ?? "idle");
    const stuck = Boolean(a.stuck);
    const emphasis = deskEmphasis(status, stuck);
    if (emphasis === "none") continue;
    marks.push({ agentId: a.id, tx: tile.x, ty: tile.y, color: stateHex(status, stuck), emphasis });
  }
  return marks.sort((a, b) => (a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0));
}
