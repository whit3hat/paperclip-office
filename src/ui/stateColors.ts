import type { OfficeState } from "../shared/office.js";

export const STATE_COLOR: Record<OfficeState | "stuck", string> = {
  working: "oklch(72% 0.15 75)",
  thinking: "oklch(62% 0.12 220)",
  blocked: "oklch(62% 0.17 25)",
  idle: "var(--muted-foreground)",
  stuck: "var(--destructive)",
};

/** Pixi Graphics and canvas Text need numeric hex, so the floor layers cannot use the CSS strings
 *  above. These are the same colours, keyed by the scene status the store carries, and they are the
 *  one place the canvas reads them from: desk tint, state ring and the roster/top-bar swatches all
 *  resolve to the same five hues. */
export const STATE_HEX: Record<string, number> = {
  working: 0xd9a441,
  thinking: 0x4d96c9,
  waiting: 0x8a8a92,
  blocked: 0xd9534f,
  looping: 0xd9534f, // stuck
  compacting: 0x9b7ede,
  success: 0x6bcb77,
  idle: 0x8a8a92,
  ghost: 0x8a8a92,
};

/** Near-black used for outlines and text haloes on the canvas. Dark enough to hold a shape against
 *  both the pale oak hall and the saturated department floors (pink is the worst case). */
export const INK_HEX = 0x1a1a1a;

export function stateHex(status: string, stuck: boolean): number {
  if (stuck) return STATE_HEX.looping;
  return STATE_HEX[status] ?? STATE_HEX.idle;
}
