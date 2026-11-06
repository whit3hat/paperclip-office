# Design language

## Subject and job

An operator watching a fleet of agents push branches into one repository. The page's job is to show who is working where and what is moving, without reading git.

## Signature

Lanes are coloured by agent, not by lane index. Each agent gets one stable hue from an 8 hue ring, hashed from its id. The same hue appears on the branch list dot, the owner chip on a commit, the Agents card edge, and the Progress bar. Branches with no agent are muted. This is the one memorable device; everything else stays quiet.

## Tokens

Surfaces, text, borders, radius, focus ring come from Paperclip's own CSS variables, switched by the `.dark` class the host sets:

```
--background  --foreground  --card  --card-foreground  --popover
--muted  --muted-foreground  --accent  --accent-foreground
--primary  --primary-foreground  --secondary  --border  --input  --ring
--destructive  --radius  --sidebar  --sidebar-border
```

`src/theme/tokens.ts` maps these to the names the components use (`surface`, `panel`, `border`, `text`, `textDim`, `hover`, `selected`, `link`). The plugin sets no background of its own and no hex greys.

Agent hues: `oklch(62% 0.16 H)` with H in 25, 70, 140, 200, 250, 290, 330, 10; lightness rises to 70% in dark mode. Pull request state: open `oklch(60% 0.17 145)`, draft `--muted-foreground`, merged `oklch(60% 0.17 300)`, closed `--destructive`.

Type: the host font stack. Monospace only for SHA and branch names.

## Layout

```
[toolbar: Fetch | branch filter | search ........ repo path · health · last fetch · ⋯]
[tabs: Graph | Agents | Progress | Activity                              live dot]
[branch pane 220 | GRAPH & SUBJECT ............ | owner | author | sha | time    ]
[detail panel 240, only after a click, with a close button]
```

Graph rows are 26 px in the default preset. Refs render as outline chips before the subject; the owner chip sits after it. The graph column is sized from the layout's widest lane and capped at 40 percent of the table, with a slider when it overflows. Pages of 120 commits load as the user scrolls.

## Canvas and page frame

The canvas is sized to the floor, never the floor to the canvas. The generated floor's aspect is a function of the company — about 0.7 for one department on the compact preset, about 2.3 for six — and upstream's camera fits with `min(view/map)` and centres, so any box that is not the floor's own shape keeps the leftover as dead canvas. The page takes the built map's size (`Camera.setMapSize` → `src/ui/sceneFit.ts`) and gives the box that aspect, capped at `min(68vh, 720px)` and never under 320 px. A floor narrower than the page gives the width back and centres, so the spare room is page background beside the office frame rather than empty canvas inside it. Fitting is the initial state and the resize behaviour, not a clamp: the wheel and the zoom buttons still go where the viewer sends them.

The map rect is the frame, so everything drawn per agent has to live inside it. A canvas with the floor's exact aspect has no slack left over, and the camera clamps the floor's edge to the viewport's, so nothing outside the map is on screen at any zoom. Plates are centred on the character, which puts half of one over the edge on an outer-wall desk — about 60 screen px of wall beside the left desk on a three-agent floor against an issue tag twice that wide. Labels therefore clamp into the map rect *inside* the deconfliction pass (`src/ui/labelLayout.ts`), so a plate pulled back inside competes for its spot under the same stable priority instead of printing over its neighbour. Sideways it slides either way; downward it only ever comes back up, and never above its own first row, because a plate belongs below the feet and not on the head. Growing the camera's fit instead is the wrong fix twice over: it hands the dead band back, and the padding would have to grow with the row stagger.

Below the canvas the page has two levels and not a stack of equals. One primary panel — Activity, open by default, because it is the one that moves — then a single strip of secondary pills for the reference tables, one open at a time. Every panel header carries a count, and a count that means trouble is `--destructive` *and* says what it is ("2 stuck"), so finding the problem never depends on separating two hues.

## Presets (config `theme`)

| Preset | Row | Chips | Lane colour | Dots |
|---|---|---|---|---|
| paperclip (default) | 26 px | outline | by agent | ring |
| sourcegit | 24 px | pill, inline before subject | by lane index | filled |
| gitlens | 28 px | rounded, own column | by agent | ring |
| fork | 30 px | pill | pastel by lane index | small |

Presets change only density, chip style, lane palette rule, and dot style. Surfaces and text never change, so every preset follows the host's light and dark modes.

## Motion

One: when a live update arrives, new rows slide in over 160 ms and the changed branch chip pulses once. `prefers-reduced-motion` turns the slide into a plain appear.

## Copy

Buttons say what happens: "Fetch remotes", "Use this repo", "Connect GitHub", "Save settings". Empty states say what to do next: "No agent has pushed to this repo yet. Assign an issue and the branch shows here." Errors name the fix: "git is not on PATH. Install Git and restart Paperclip."

## What was rejected

A dark background with one acid accent, a custom display font, and numbered section markers. None of them fit a page that must sit inside another product's chrome.

## References consulted

SourceGit (density, branch tree, ref pills), GitLens commit graph (ref chips in their own column, minimap), Fork (three pane layout, detail panel with committer). Screenshots and notes are kept locally in `.scratch/design/`, which is not committed.
