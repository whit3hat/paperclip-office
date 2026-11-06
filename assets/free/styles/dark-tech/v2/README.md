# Dark tech — generation prompts (v2 modular)

A second style for the generated office floor, chosen by the owner on 2026-11-06. Four sheets, same pipeline as `../../scandi-wood/v2`.

## The one rule that makes this cheap

**The rectangle list is byte-identical in structure to Scandi wood v2.** Only the `STYLE` and `PALETTE` paragraphs differ, plus the per-object material wording. Every object occupies the same cells and keeps the same name, so:

- `scripts/build-style-v2.py` needs no changes.
- the room plans and seat geometry in `src/layout/styles/scandi.ts` are reused, not rewritten — the new style supplies an atlas and a palette, nothing else.
- a tile that looks wrong can be compared against the Scandi tile in the same cell.

Do **not** add, remove or resize objects while generating. Team-specific prop swaps (a monitoring wall in place of the ping-pong table, for instance) are a later change that costs a layout edit; they are deliberately out of scope here.

Four object keys are named after Scandi colours and keep their names so the layout keeps working. Their Dark tech content:

| key | Scandi | Dark tech |
|---|---|---|
| `floor_pink` | dusty-pink carpet | deep blue carpet `#1D2C44` |
| `floor_blue` | pale-blue carpet | deep violet carpet `#2A2246` |
| `floor_mustard` | mustard carpet | dark teal carpet `#163238` |
| `floor_sage2` | sage carpet | graphite carpet `#22252D` |
| `chair_up_sage` / `_pink` / `_blue` / `_mustard` | pastel upholstery | cyan / magenta / violet / amber accent stitch |

Renaming these to `floor_accent1..4` and `chair_up_1..4` is a follow-up refactor, not a blocker.

## How to generate

1. Open **one** ChatGPT chat for the whole style. A fresh chat drifts the palette and the pixel scale.
2. Paste `prompt-1.txt`, download the result as `dark-tech-1.png`.
3. In the **same chat**, paste `prompt-2.txt`, then `prompt-3.txt`, then `prompt-4.txt`, saving `dark-tech-2.png` … `dark-tech-4.png`.
4. If one object is wrong: `Redraw only <rectangle>, keep every other pixel of the sheet identical.` Never regenerate a whole sheet for one bad object — the palette shifts.
5. Drop the four PNGs in this directory.

`base-prompt.txt` and `sheet-N.txt` are the parts; `prompt-N.txt` is the two concatenated plus a per-sheet priority footer, and is the file to paste.

## Check before handing them over

- Floors: put two copies of a floor swatch side by side in any viewer. No visible line where they meet.
- Walls: the long strip `A8:P10` has no vertical lines anywhere.
- Each monitor OFF/ON desk pair and the server rack OFF/ON pair are identical apart from the screen or the lights.
- The status lamp and the desk flag are white/grey only — the engine tints them per agent state.
- Any canvas size is acceptable (ChatGPT often returns 1254 × 1254); the slicer rescales. Non-magenta transparent backgrounds are also fine.

## What happens next, in the repo

1. Measure each object's pixel box on the delivered sheets into `objects.json`. These boxes are measured from the actual art, not copied from Scandi — the generator never lands exactly on the nominal grid, and that is what the Scandi v1 attempt got wrong.
2. `python scripts/build-style-v2.py assets/free/styles/dark-tech` → `v2/build/atlas.png` + `atlas.json`.
3. Pack to `src/layout/styles/darkTech.png` / `darkTech.atlas.ts`, add a palette, register the theme, add it to the settings picker.
4. Record the source and licence in `assets/catalogue.json` and `NOTICE`.
