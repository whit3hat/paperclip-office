import { useState, type ReactNode } from "react";
import { tokens } from "./tokens.js";

// Everything under the canvas, in two levels instead of one.
//
// It used to be a stack of identical bars — Activity, Scoreboard, Chain of command, Agent states —
// each the same weight, each saying "Show" and nothing else, so the page ended in grey repetition
// that never said which one had anything in it. Hierarchy is visible now: Activity is the primary
// panel and is open, because it is the one that moves; the three reference tables sit behind one
// secondary strip of pills. Pre-attentive before symbolic — every header carries a count, and the
// counts that mean trouble are destructive-coloured *and* worded ("2 stuck"), so the signal never
// depends on telling two hues apart.

function readPanel(key: string): string | null {
  try {
    return localStorage.getItem(`office.panel.${key}`);
  } catch {
    return null;
  }
}

function writePanel(key: string, value: string): void {
  try {
    localStorage.setItem(`office.panel.${key}`, value);
  } catch {}
}

/** Open state for one panel, remembered per viewer. */
export function usePanelOpen(id: string, fallback: boolean): [boolean, () => void] {
  const [open, setOpen] = useState(() => {
    const v = readPanel(id);
    return v === null ? fallback : v === "1";
  });
  return [
    open,
    () => {
      setOpen(!open);
      writePanel(id, open ? "0" : "1");
    },
  ];
}

export type BadgeTone = "muted" | "new" | "alert";

export interface PanelBadge {
  text: string;
  tone?: BadgeTone;
}

const TONE: Record<BadgeTone, { color: string; background: string }> = {
  muted: { color: tokens.mutedForeground, background: tokens.accent },
  new: { color: tokens.primary, background: "color-mix(in oklch, var(--primary) 14%, transparent)" },
  alert: { color: tokens.destructive, background: "color-mix(in oklch, var(--destructive) 14%, transparent)" },
};

export function Badge({ text, tone = "muted" }: PanelBadge) {
  return (
    <span
      style={{
        ...TONE[tone],
        fontSize: 12,
        fontWeight: tone === "muted" ? 400 : 600,
        padding: "1px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

const panelSurface = { border: `1px solid ${tokens.border}`, borderRadius: tokens.radius, background: tokens.surface, minWidth: 0 };

/** The one panel that leads the strip: heavier title, open unless the viewer closed it.
 *  Controlled, because its badges depend on whether it is open — a feed you are looking at has
 *  no "new" to report. */
export function PrimaryPanel({
  open,
  toggle,
  title,
  subtitle,
  badges = [],
  children,
}: {
  open: boolean;
  toggle: () => void;
  title: string;
  subtitle?: string;
  badges?: PanelBadge[];
  children: ReactNode;
}) {
  return (
    <section style={panelSurface}>
      <button
        onClick={toggle}
        aria-expanded={open}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px",
          background: "transparent", border: "none", color: "inherit", cursor: "pointer", font: "inherit", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
        {subtitle && <span style={{ fontSize: 13, color: tokens.mutedForeground }}>{subtitle}</span>}
        {badges.map((b) => (
          <Badge key={b.text} {...b} />
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: tokens.mutedForeground }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div style={{ borderTop: `1px solid ${tokens.border}` }}>{children}</div>}
    </section>
  );
}

const PANEL_ID = "office-detail-panel";

export interface DetailPanel {
  id: string;
  title: string;
  badges?: PanelBadge[];
  /** Lazy: a closed tab's table is never built. */
  body: () => ReactNode;
}

/** The reference tables behind one strip, one open at a time. Nothing that was reachable stops being
 *  reachable; it stops being four full-width bars shouting at the same volume. */
export function DetailStrip({ panels }: { panels: DetailPanel[] }) {
  // No remembered choice opens whatever is flagged, so a stuck agent surfaces its table unasked.
  const [active, setActive] = useState<string | null>(() => {
    const stored = readPanel("detail");
    return stored === null ? panels.find((p) => p.badges?.some((b) => b.tone === "alert"))?.id ?? null : stored || null;
  });
  if (panels.length === 0) return null;
  const open = panels.find((p) => p.id === active);
  const pick = (id: string) => {
    const next = active === id ? null : id;
    setActive(next);
    writePanel("detail", next ?? "");
  };
  return (
    <section style={panelSurface}>
      {/* Disclosure buttons sharing one region, not tabs: a second click closes the open one, which
          `aria-selected` cannot say. */}
      <div role="group" aria-label="Reference tables" style={{ display: "flex", gap: 6, padding: 6, flexWrap: "wrap" }}>
        {panels.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              aria-expanded={on}
              aria-controls={PANEL_ID}
              onClick={() => pick(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "4px 10px", borderRadius: 999,
                border: `1px solid ${on ? tokens.primary : "transparent"}`,
                background: on ? tokens.selected : "transparent",
                color: on ? tokens.foreground : tokens.mutedForeground,
                cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 500,
              }}
            >
              {t.title}
              {t.badges?.map((b) => (
                <Badge key={b.text} {...b} />
              ))}
            </button>
          );
        })}
      </div>
      {open && (
        <div id={PANEL_ID} style={{ borderTop: `1px solid ${tokens.border}`, overflowX: "auto" }}>
          {open.body()}
        </div>
      )}
    </section>
  );
}
