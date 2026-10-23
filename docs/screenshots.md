# Taking the screenshots

`docs/screenshots/*.png` is the published set — it is what the README shows and what a design
review argues over, so it is regenerated rather than retouched.

```bash
npm run demo                        # build demo/dist
node scripts/screenshots.mjs        # whole set -> docs/screenshots/
node scripts/screenshots.mjs office # or just the named shots
```

The script serves `demo/dist` on a loopback port and drives it with puppeteer. Three environment
variables matter:

| Variable    | Why                                                                      |
| ----------- | ------------------------------------------------------------------------ |
| `PUPPETEER` | Resolve puppeteer from outside this repo. It is deliberately not a dependency — nothing but this script wants a browser, and a published plugin should not drag one in. |
| `OUT`       | Write somewhere other than `docs/screenshots`. Use it to eyeball a run before replacing the set. |
| `SHOT_TMPDIR` | Where Chrome keeps its profile and scratch. Defaults to `~/.cache/paperclip-office-shots/tmp`; see below for why it is not `TMPDIR`. |

`PUPPETEER` must name puppeteer's **ESM entry file**, not its package directory. The script loads
it with a bare `import()`, and Node resolves `exports` only for a package *specifier* — given a
path it falls back to plain file resolution, where a directory is `ERR_UNSUPPORTED_DIR_IMPORT`:

```bash
export PUPPETEER=~/.cache/puppeteer-host/node_modules/puppeteer/lib/esm/puppeteer/puppeteer.js
```

Pointing at `.../node_modules/puppeteer` fails immediately, before the browser is ever launched.

## It is slow, and that is expected

With no GPU, Chrome falls back to SwiftShader and renders the floor in software. Pixi clamps
elapsed time per frame, so a low frame rate makes the scene run in slow motion.

The characters do not start at their desks. Every one of them spawns at the office door and walks
there, so a shot taken on page load catches the whole company heaped by the entrance with its
nameplates and thought clouds stacked on each other. `ready()` in the script waits that walk-in
out by watching how many characters are standing on their own desk tile: that count climbs and
then plateaus. Measured on a software-GL box with a 23-agent roster, the first character reached
a desk at about 90 seconds and they were still arriving at three and a half minutes. Budget about
five minutes per office shot.

The plateau settles *below* the roster and should. An agent waiting on a human paces at the door
and idle characters roam, so they never arrive — "the floor is still" is not a state this scene
has.

## On a bare box (no root)

A container with no desktop packages has neither the libraries Chrome links nor any fonts. Both
are fixable from a user account; neither needs a change to the host.

Chrome itself comes from puppeteer's cache (`~/.cache/puppeteer`). Point the script at a complete
one — a half-finished download leaves an empty version directory, so check the binary runs before
blaming anything else:

```bash
export PUPPETEER_EXECUTABLE_PATH=~/.cache/puppeteer/chrome-headless-shell/<version>/chrome-headless-shell-linux64/chrome-headless-shell
"$PUPPETEER_EXECUTABLE_PATH" --version
```

`error while loading shared libraries` means the deps are missing. Chrome ships its own list next
to the binary in `deb.deps`. Unpack those packages into a prefix you own and put it on the
library path — on Debian trixie that is the `t64` variants of most of the list:

```bash
mkdir -p ~/.cache/sysroot/debs && cd ~/.cache/sysroot/debs
apt-get download libglib2.0-0t64 libnss3 libatomic1 ...   # see deb.deps
for d in *.deb; do dpkg -x "$d" ~/.cache/sysroot/root; done
export LD_LIBRARY_PATH=~/.cache/sysroot/root/usr/lib/x86_64-linux-gnu:~/.cache/sysroot/root/lib/x86_64-linux-gnu
```

`deb.deps` lists only Chrome's direct dependencies, so the transitive ones surface one at a time
as you re-run `--version`. Three never appear in that file and all three stop the binary dead:

| Missing       | Why it is not in `deb.deps`                  |
| ------------- | -------------------------------------------- |
| `libatomic1`  | pulled in by the toolchain, not by a package |
| `libavahi-common3`, `libavahi-client3` | transitive through `libcups2` |
| `libfribidi0` | transitive through `libpango-1.0-0`          |

Resolve the rest the same way: run the binary, read the one library it names, download the package
that owns it, unpack, repeat. It converges in a handful of rounds.

Stage it somewhere that survives a dead run. `/tmp` is tempting and wrong under Paperclip — the
run scratch directory is removed when the run ends, so an interrupted screenshot session throws
away the whole unpacked tree and the next one rebuilds ~70 packages from nothing. A directory
under `~/.cache` costs the same and keeps it.

### Chrome's profile must not live in the run scratch either

The same trap, one level down, and it fails far more confusingly. `puppeteer.launch()` with no
`userDataDir` creates one with `mkdtemp` under `TMPDIR`, and under Paperclip `TMPDIR` *is* the run
scratch directory. Detach a render so it outlives its run and the next browser launch has nowhere
to put a profile: the launch hangs, so does the `browser.close()` before it, and the render sits at
0% CPU indefinitely. There is no error — it looks exactly like a slow office shot, which is the one
thing this script has taught you to be patient about.

The script therefore ignores an inherited `TMPDIR` and points it at `SHOT_TMPDIR` before launching
anything. To check a detached render is genuinely independent, read the env of the node process
rather than the wrapper:

```bash
tr '\0' '\n' < /proc/$(pgrep -f screenshots.mjs)/environ | grep TMPDIR
```

It should name the cache directory. If it names `/tmp/paperclip-run-*`, the render dies with the
run that started it.

**Install fonts too.** With none present Chrome still renders, so the failure is quiet: the
screenshots come out with the floor intact and the text wrong. That is worthless for the one
thing this set is for. Unpack `fonts-liberation`, `fonts-dejavu-core`, `fonts-dejavu-mono` and
`fontconfig-config`, drop the `.ttf` files in `~/.local/share/fonts`, and point fontconfig at the
unpacked config:

```bash
export FONTCONFIG_PATH=~/.cache/sysroot/root/etc/fonts
```

Unpacking `fontconfig-config` gets you the configuration but not `fc-list`, which lives in the
`fontconfig` binary package — so the obvious check is usually unavailable. Shoot `widget` instead.
It is the cheap one — no floor, so it skips the walk-in wait — and it is all text, so it answers
the question in one shot and in under a minute:

```bash
OUT=/tmp/shots node scripts/screenshots.mjs widget
```

Open it. Real glyphs with the state counts legible means fonts resolved; boxes, blanks or
uniform-width text mean they did not, and nothing else is worth rendering until they do.
