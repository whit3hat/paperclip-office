/** Screen-space box for one agent's nameplate. `x`/`y` are the top-left corner. */
export interface LabelBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Lower wins a contested spot. Must be derived from the data, never from iteration order. */
  rank: number;
}

export interface LabelSlot {
  /** Rows below the agent's feet: 0 is the normal spot, 1 and 2 are the stagger. */
  row: number;
  visible: boolean;
}

export const MAX_LABEL_ROWS = 3;

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad: number): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/** Deconflict nameplates: each one keeps its spot if it is free, otherwise drops a row, and is
 *  suppressed once every row is taken. Important plates (stuck, blocked, the chief) claim their
 *  spot first; ties break on agent id, so the same company always produces the same floor however
 *  the agents happen to be ordered. */
export function resolveLabelRows(boxes: LabelBox[], rowHeight: number, pad = 1): Map<string, LabelSlot> {
  const order = [...boxes].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const out = new Map<string, LabelSlot>();
  for (const box of order) {
    let slot: LabelSlot = { row: 0, visible: false };
    for (let row = 0; row < MAX_LABEL_ROWS; row++) {
      const rect = { x: box.x, y: box.y + row * rowHeight, w: box.w, h: box.h };
      if (placed.some((p) => overlaps(rect, p, pad))) continue;
      placed.push(rect);
      slot = { row, visible: true };
      break;
    }
    out.set(box.id, slot);
  }
  return out;
}
