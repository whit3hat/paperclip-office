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
  /** Screen px the plate was pushed by to stay inside `bounds`; 0 when nothing clamped it. */
  dx: number;
  dy: number;
}

export const MAX_LABEL_ROWS = 3;

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, pad: number): boolean {
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

export interface LabelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Nothing outside the map rect is ever on screen: the camera clamps the floor's edge to the
 *  viewport's, so a plate hanging past the map is cut off at every zoom. Pull the candidate rect
 *  back inside before it competes, so the clamped plate takes its turn in the overlap pass under
 *  the same stable priority as everyone else — rather than being drawn wherever it landed and
 *  shaved by the canvas edge, which is what HAV-90 found once the canvas stopped letterboxing.
 *
 *  Horizontally it slides either way. Vertically it only ever moves *up*, and never above its own
 *  row-0 spot: plates hang below the feet, and a plate climbing onto the agent's head to escape
 *  the bottom wall trades one defect for another. A box too big for the rect sits flush with the
 *  near edge instead of being pushed out the far one. */
function clampRect(rect: LabelRect, floor: number, bounds: LabelRect): LabelRect {
  const left = bounds.x;
  const right = Math.max(left, bounds.x + bounds.w - rect.w);
  const top = Math.max(floor, bounds.y);
  const bottom = Math.max(top, bounds.y + bounds.h - rect.h);
  return {
    x: Math.min(Math.max(rect.x, left), right),
    y: Math.min(Math.max(rect.y, top), bottom),
    w: rect.w,
    h: rect.h,
  };
}

/** Deconflict plates: each one keeps its spot if it is free, otherwise drops a row, and is
 *  suppressed once every row is taken. Important plates (stuck, blocked, the chief) claim their
 *  spot first; ties break on agent id, so the same company always produces the same floor however
 *  the agents happen to be ordered.
 *
 *  `occupied` seeds the pass with ground already taken by an earlier one. Issue tags are packed in
 *  a second pass against the nameplates, because a tag hangs off whichever row its own name ended
 *  up on and so cannot be placed until that is known. Returns the rects it claimed so the caller
 *  can feed them forward.
 *
 *  `bounds` is the rect every plate has to stay inside, in the same screen pixels as the boxes —
 *  the map rect, not the viewport. Omit it and nothing is clamped. */
export function packLabels(
  boxes: LabelBox[],
  rowHeight: number,
  pad = 1,
  occupied: readonly LabelRect[] = [],
  bounds?: LabelRect,
): { slots: Map<string, LabelSlot>; placed: LabelRect[] } {
  const order = [...boxes].sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: LabelRect[] = [...occupied];
  const slots = new Map<string, LabelSlot>();
  for (const box of order) {
    let slot: LabelSlot = { row: 0, visible: false, dx: 0, dy: 0 };
    for (let row = 0; row < MAX_LABEL_ROWS; row++) {
      const nominal = { x: box.x, y: box.y + row * rowHeight, w: box.w, h: box.h };
      const rect = bounds ? clampRect(nominal, box.y, bounds) : nominal;
      if (placed.some((p) => overlaps(rect, p, pad))) continue;
      placed.push(rect);
      slot = { row, visible: true, dx: rect.x - nominal.x, dy: rect.y - nominal.y };
      break;
    }
    slots.set(box.id, slot);
  }
  return { slots, placed };
}

/** packLabels when only the row assignment matters. */
export function resolveLabelRows(boxes: LabelBox[], rowHeight: number, pad = 1): Map<string, LabelSlot> {
  return packLabels(boxes, rowHeight, pad).slots;
}
