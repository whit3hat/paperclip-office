// Canvas type, per docs/design-language.md: the host UI face for everything the office says, and
// monospace only for machine strings (issue keys, SHAs, branch names).
//
// Pixi renders Text through the 2D canvas `font` shorthand, which cannot parse `var(--font-sans)`
// — a declaration containing it is dropped whole, taking the font SIZE with it. So read the host's
// custom property once and pass the concrete stack it resolves to.

const FALLBACK_UI = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FALLBACK_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export interface CanvasFonts {
  ui: string;
  mono: string;
}

let cached: CanvasFonts | null = null;

function hostFont(variable: string, fallback: string): string {
  if (typeof document === "undefined" || !document.documentElement) return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

/** The host's font stacks, read once per page. */
export function canvasFonts(): CanvasFonts {
  if (!cached) cached = { ui: hostFont("--font-sans", FALLBACK_UI), mono: hostFont("--font-mono", FALLBACK_MONO) };
  return cached;
}

/** Test seam; the host's fonts do not change at runtime. */
export function resetCanvasFonts(): void {
  cached = null;
}
