# Taking the screenshots

`docs/screenshots/*.png` is the published set — it is what the README shows and what a design
review argues over, so it is regenerated rather than retouched.

```bash
npm run demo                        # build demo/dist
node scripts/screenshots.mjs        # whole set -> docs/screenshots/
node scripts/screenshots.mjs office # or just the named shots
```

The script serves `demo/dist` on a loopback port and drives it with puppeteer. Two environment
variables matter:

| Variable    | Why                                                                      |
| ----------- | ------------------------------------------------------------------------ |
| `PUPPETEER` | Resolve puppeteer from outside this repo. It is deliberately not a dependency — nothing but this script wants a browser, and a published plugin should not drag one in. |
| `OUT`       | Write somewhere other than `docs/screenshots`. Use it to eyeball a run before replacing the set. |

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
library path — on Debian trixie that is the `t64` variants of most of the list, plus `libatomic1`,
which `deb.deps` does not mention:

```bash
mkdir -p /tmp/sysroot && cd /tmp/debs
apt-get download libglib2.0-0t64 libnss3 libatomic1 ...   # see deb.deps
for d in *.deb; do dpkg -x "$d" /tmp/sysroot; done
export LD_LIBRARY_PATH=/tmp/sysroot/usr/lib/x86_64-linux-gnu:/tmp/sysroot/lib/x86_64-linux-gnu
```

**Install fonts too.** With none present Chrome still renders, so the failure is quiet: the
screenshots come out with the floor intact and the text wrong. That is worthless for the one
thing this set is for. Unpack `fonts-liberation`, `fonts-dejavu-core`, `fonts-dejavu-mono` and
`fontconfig-config`, drop the `.ttf` files in `~/.local/share/fonts`, and point fontconfig at the
unpacked config:

```bash
export FONTCONFIG_PATH=/tmp/sysroot/etc/fonts
fc-list | wc -l    # not zero
```

Shoot `widget` first. It is the cheap one — no floor, so it skips the walk-in wait — and it is all
text, so it tells you immediately whether fonts resolved.
