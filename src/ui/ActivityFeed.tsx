import { useEffect, useMemo, useState } from "react";
import { usePluginData, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import { ACTIVITY_DATA_KEY, type ActivityEvent, type ActivityType } from "../shared/activity.js";
import { tokens } from "./tokens.js";
import { useStore } from "../adapters/store.js";
import { PrimaryPanel, usePanelOpen, type PanelBadge } from "./Panels.js";

const SEEN_KEY = "office.activity.seen";

/** Timestamp of the newest event the viewer has had on screen. Only the feed being open counts as
 *  having seen it, so a closed feed can report what arrived while it was shut. */
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

const TYPE_LABEL: Record<ActivityType, string> = {
  run_started: "Run started",
  run_finished: "Run finished",
  run_failed: "Run failed",
  issue_created: "Issue created",
  issue_status_changed: "Issue updated",
  comment_posted: "Comment",
  approval_requested: "Approval requested",
  approval_decided: "Approval decided",
};

const TYPES = Object.keys(TYPE_LABEL) as ActivityType[];

function ago(iso: string): string {
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        border: `1px solid ${active ? tokens.primary : tokens.border}`,
        background: active ? tokens.selected : "transparent",
        color: "inherit",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function ActivityFeed({ companyId, windowHours, limit }: { companyId: string; windowHours: number; limit: number }) {
  const { data } = usePluginData<{ events: ActivityEvent[] }>(ACTIVITY_DATA_KEY, { companyId, limit });
  const nav = useHostNavigation();
  const [open, toggle] = usePanelOpen("activity", true);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ActivityType | null>(null);

  const events = data?.events ?? [];
  const newest = useMemo(() => events.reduce<string | null>((max, e) => (max && max >= e.at ? max : e.at), null), [events]);
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => {
    if (!open || !newest || (seen && seen >= newest)) return;
    try {
      localStorage.setItem(SEEN_KEY, newest);
    } catch {}
    setSeen(newest);
  }, [open, newest, seen]);
  const fresh = seen ? events.filter((e) => e.at > seen).length : 0;
  // Open, the feed is its own badge; closed, it owes the viewer a count of what it is hiding.
  const badges: PanelBadge[] =
    open || fresh === 0 ? [{ text: `${events.length} event${events.length === 1 ? "" : "s"}` }] : [{ text: `${fresh} new`, tone: "new" }];
  const agents = useMemo(() => {
    const names = new Map<string, string>();
    for (const e of events) if (e.agentId && e.agentName) names.set(e.agentId, e.agentName);
    return [...names.entries()];
  }, [events]);

  const filtered = events.filter(
    (e) => (!agentFilter || e.agentId === agentFilter) && (!typeFilter || e.type === typeFilter),
  );

  return (
    <PrimaryPanel open={open} toggle={toggle} title="Activity" subtitle={`last ${windowHours}h`} badges={badges}>
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip active={agentFilter === null} onClick={() => setAgentFilter(null)}>
            All agents
          </Chip>
          {agents.map(([id, agentName]) => (
            <Chip key={id} active={agentFilter === id} onClick={() => setAgentFilter(agentFilter === id ? null : id)}>
              {agentName}
            </Chip>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip active={typeFilter === null} onClick={() => setTypeFilter(null)}>
            All types
          </Chip>
          {TYPES.map((t) => (
            <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)}>
              {TYPE_LABEL[t]}
            </Chip>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 320, overflowY: "auto" }}>
          {filtered.length === 0 && <div style={{ color: tokens.mutedForeground, fontSize: 13, padding: "8px 0" }}>Nothing here yet.</div>}
          {filtered.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                padding: "6px 4px",
                borderBottom: `1px solid ${tokens.border}`,
                fontSize: 13,
              }}
            >
              <span style={{ color: tokens.mutedForeground, fontSize: 11, whiteSpace: "nowrap", width: 64 }}>{ago(e.at)}</span>
              {e.agentId && (
                <a
                  onClick={() => useStore.getState().select(e.agentId!)}
                  style={{ color: "inherit", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {e.agentName}
                </a>
              )}
              <span style={{ color: tokens.mutedForeground }}>
                {e.issueId ? (
                  <a {...nav.linkProps(`/issues/${e.issueLabel}`)} style={{ color: "inherit" }}>
                    {e.text}
                  </a>
                ) : (
                  e.text
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </PrimaryPanel>
  );
}
