import { afterEach, describe, expect, it } from "vitest";
import { deskEmphasis, deskMarks } from "../src/ui/deskMarks.js";
import { STATE_HEX } from "../src/ui/stateColors.js";
import { MAX_LABEL_ROWS, packLabels, resolveLabelRows, type LabelBox } from "../src/ui/labelLayout.js";
import {
  BUBBLE_CAP,
  BUBBLE_CAP_FAR,
  applyBubbleBudget,
  chooseBubbles,
  registerBubbleHolder,
  setBubbleYield,
  unregisterBubbleHolder,
} from "../src/ui/bubbleBudget.js";

const seats = new Map([
  ["a", { x: 1, y: 1 }],
  ["b", { x: 2, y: 1 }],
  ["c", { x: 3, y: 1 }],
]);

describe("deskMarks", () => {
  it("marks a desk for every state worth seeing and leaves resting desks alone", () => {
    expect(deskEmphasis("working", false)).toBe("state");
    expect(deskEmphasis("blocked", false)).toBe("state");
    expect(deskEmphasis("idle", false)).toBe("none");
    expect(deskEmphasis("waiting", false)).toBe("none");
    expect(deskEmphasis("ghost", false)).toBe("none");
  });

  it("gives stuck its own emphasis, whichever status it carries", () => {
    expect(deskEmphasis("looping", false)).toBe("alert");
    expect(deskEmphasis("working", true)).toBe("alert");
    expect(deskEmphasis("idle", true)).toBe("alert");
  });

  it("uses the same colours as the state ring and the roster", () => {
    const marks = deskMarks(
      [
        { id: "a", status: "working" },
        { id: "b", status: "blocked" },
        { id: "c", status: "working", stuck: true },
      ],
      seats,
    );
    expect(marks.map((m) => [m.agentId, m.color, m.emphasis])).toEqual([
      ["a", STATE_HEX.working, "state"],
      ["b", STATE_HEX.blocked, "state"],
      ["c", STATE_HEX.looping, "alert"],
    ]);
  });

  it("skips agents with no desk and is ordered by agent id, whatever the input order", () => {
    const agents = [
      { id: "c", status: "working" },
      { id: "nobody", status: "working" },
      { id: "a", status: "thinking" },
    ];
    const marks = deskMarks(agents, seats);
    expect(marks.map((m) => m.agentId)).toEqual(["a", "c"]);
    expect(deskMarks([...agents].reverse(), seats)).toEqual(marks);
  });
});

describe("resolveLabelRows", () => {
  const box = (id: string, x: number, rank = 3): LabelBox => ({ id, x, y: 100, w: 30, h: 10, rank });

  it("keeps the row for plates that do not touch", () => {
    const rows = resolveLabelRows([box("a", 0), box("b", 100)], 13);
    expect(rows.get("a")).toEqual({ row: 0, visible: true });
    expect(rows.get("b")).toEqual({ row: 0, visible: true });
  });

  it("drops one of two overlapping plates to the next row instead of printing PAlliver", () => {
    const rows = resolveLabelRows([box("pa", 10), box("oliver", 20)], 13);
    // Same priority, so the agent id decides which one holds row 0 — stably, every frame.
    expect(rows.get("oliver")).toEqual({ row: 0, visible: true });
    expect(rows.get("pa")).toEqual({ row: 1, visible: true });
  });

  it("suppresses a plate once every row is taken", () => {
    const stacked = ["a", "b", "c", "d"].map((id, i) => box(id, i * 2));
    const rows = resolveLabelRows(stacked, 13);
    const shown = [...rows.values()].filter((r) => r.visible);
    expect(shown).toHaveLength(MAX_LABEL_ROWS);
    expect(rows.get("d")?.visible).toBe(false);
  });

  it("gives the contested spot to the higher-priority plate", () => {
    const rows = resolveLabelRows([box("quiet", 10, 3), box("stuck", 12, 0)], 13);
    expect(rows.get("stuck")).toEqual({ row: 0, visible: true });
    expect(rows.get("quiet")?.row).toBe(1);
  });

  it("is the same result whatever order the agents arrive in", () => {
    const boxes = [box("b", 12), box("a", 10), box("c", 14)];
    expect(resolveLabelRows([...boxes].reverse(), 13)).toEqual(resolveLabelRows(boxes, 13));
  });
});

describe("packLabels second pass", () => {
  const box = (id: string, x: number, y: number, rank = 3): LabelBox => ({ id, x, y, w: 30, h: 10, rank });

  it("reports the ground it claimed so a later pass can avoid it", () => {
    const { slots, placed } = packLabels([box("a", 0, 100)], 13);
    expect(slots.get("a")).toEqual({ row: 0, visible: true });
    expect(placed).toEqual([{ x: 0, y: 100, w: 30, h: 10 }]);
  });

  it("moves an issue tag off a nameplate rather than printing NWR-PA1", () => {
    // The PA's plate holds the spot the tag would land on; the tag has to step down a row.
    const { placed } = packLabels([box("pa", 10, 112)], 13);
    const tags = packLabels([box("marcus-tag", 0, 112)], 13, 1, placed).slots;
    expect(tags.get("marcus-tag")?.row).toBe(1);
  });

  it("leaves a tag alone when nothing is in its way", () => {
    const { placed } = packLabels([box("pa", 500, 112)], 13);
    const tags = packLabels([box("marcus-tag", 0, 112)], 13, 1, placed).slots;
    expect(tags.get("marcus-tag")).toEqual({ row: 0, visible: true });
  });
});

describe("chooseBubbles", () => {
  const many = (n: number, status: string) =>
    Array.from({ length: n }, (_, i) => ({ id: `agent-${String(i).padStart(2, "0")}`, status }));

  it("shows every cloud when the floor is under the cap", () => {
    expect(chooseBubbles(many(3, "working"), 1).size).toBe(3);
  });

  it("caps the pile, and caps it harder at whole-floor zoom", () => {
    expect(chooseBubbles(many(30, "working"), 1).size).toBe(BUBBLE_CAP);
    expect(chooseBubbles(many(30, "working"), 0.3).size).toBe(BUBBLE_CAP_FAR);
  });

  it("keeps the clouds that mean something when it has to choose", () => {
    const candidates = [...many(10, "working"), { id: "zz-stuck", stuck: true }, { id: "zy-blocked", status: "blocked" }];
    const chosen = chooseBubbles(candidates, 0.3);
    expect([...chosen].sort()).toContain("zz-stuck");
    expect([...chosen].sort()).toContain("zy-blocked");
  });

  it("picks the same agents whatever order they arrive in", () => {
    const candidates = many(20, "working");
    expect([...chooseBubbles([...candidates].reverse(), 1)].sort()).toEqual([...chooseBubbles(candidates, 1)].sort());
  });

  // The cap alone left the published whole-floor shot piled: characters bunch by the door and at
  // the roaming spots, and three clouds on one anchor is a heap however far under the cap it is.
  describe("the rect pass", () => {
    const at = (id: string, x: number, y: number) => ({ id, status: "working", x, y, text: "Reviewing PR for OAuth login" });

    it("keeps one cloud when characters stand on the same spot", () => {
      const chosen = chooseBubbles([at("a", 400, 600), at("b", 402, 601), at("c", 399, 603)], 1);
      expect(chosen.size).toBe(1);
    });

    it("lets them all talk once they are spread out", () => {
      const chosen = chooseBubbles([at("a", 100, 600), at("b", 400, 600), at("c", 700, 600)], 1);
      expect(chosen.size).toBe(3);
    });

    it("gives the one cloud to the agent that matters, not the nearest one", () => {
      const chosen = chooseBubbles(
        [at("a-working", 400, 600), { ...at("z-stuck", 402, 601), stuck: true }],
        1,
      );
      expect([...chosen]).toEqual(["z-stuck"]);
    });

    it("needs more clearance zoomed out, because the clouds counter-scale", () => {
      const spread = [at("a", 300, 600), at("b", 440, 600)];
      expect(chooseBubbles(spread, 1).size).toBe(2);
      expect(chooseBubbles(spread, 0.4).size).toBe(1);
    });

    it("is stable frame to frame: a hidden cloud does not reclaim its spot", () => {
      // The reason the rect is estimated from the text rather than read off the live bubble. If a
      // suppressed cloud reported no rect, it would stop losing and flicker back on.
      const pile = [at("a", 400, 600), at("b", 401, 600)];
      expect([...chooseBubbles(pile, 1)]).toEqual([...chooseBubbles(pile, 1)]);
    });

    it("still packs on the cap alone when nobody reports a position", () => {
      expect(chooseBubbles(many(30, "working"), 1).size).toBe(BUBBLE_CAP);
    });
  });
});

describe("applyBubbleBudget", () => {
  const holders = (ids: string[]) => {
    const allowed = new Map(ids.map((id) => [id, false]));
    for (const id of ids) {
      registerBubbleHolder(id, { wantsBubble: () => true, allowBubble: (on) => allowed.set(id, on) });
    }
    return allowed;
  };

  afterEach(() => {
    setBubbleYield(null);
    for (const id of ["a", "b"]) unregisterBubbleHolder(id);
  });

  it("lets everyone under the cap keep their cloud", () => {
    const allowed = holders(["a", "b"]);
    applyBubbleBudget([{ id: "a", status: "working" }, { id: "b", status: "working" }], 1);
    expect([...allowed]).toEqual([["a", true], ["b", true]]);
  });

  it("silences the desk the PA is standing at, and only that one", () => {
    const allowed = holders(["a", "b"]);
    setBubbleYield("a");
    applyBubbleBudget([{ id: "a", status: "working" }, { id: "b", status: "working" }], 1);
    expect([...allowed]).toEqual([["a", false], ["b", true]]);
  });

  it("silences a stuck agent too — the PA's question is the one bubble over that desk", () => {
    const allowed = holders(["a", "b"]);
    setBubbleYield("a");
    applyBubbleBudget([{ id: "a", status: "working", stuck: true }, { id: "b", status: "idle" }], 1);
    expect(allowed.get("a")).toBe(false);
  });

  it("gives the cloud back once the PA walks on", () => {
    const allowed = holders(["a", "b"]);
    setBubbleYield("a");
    applyBubbleBudget([{ id: "a", status: "working" }], 1);
    setBubbleYield(null);
    applyBubbleBudget([{ id: "a", status: "working" }], 1);
    expect(allowed.get("a")).toBe(true);
  });
});
