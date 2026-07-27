# Carmageddon Tuner

A terminal UI for editing **Carmageddon** (Stainless Games, 1997) car and
opponent stats, without hand-editing encrypted files.

Pick a car, change its mass or top speed, review what you changed, save. The
same on Windows and Linux.

## Download

Grab the file for your system from the
[releases page](../../releases), unzip it and run it. **No Node, no npm,
nothing to install.**

About 26 MB to download, 67 MB unzipped: the executable carries the whole Node
runtime so you do not have to install one. On Linux and macOS, mark it
executable first with `chmod +x`.

### "Windows protected your PC"

SmartScreen blocks any executable that is not signed by a recognised publisher,
whatever it does. Click **More info**, then **Run anyway**.

This one is not signed because a code-signing certificate costs a few hundred
euros a year and, since 2023, has to live on a hardware token, which does not
fit a free CI pipeline. If you would rather not take that on faith, the
[source](../../) is here and `npm run build` reproduces the same binary.

## Usage

```sh
carmageddon-tuner [game folder]

# for example
carmageddon-tuner "D:/Games/Carmageddon"
```

Point it at the install root or at the `DATA` folder, whichever you have handy.
A **Max Pack** installs two complete games side by side, so there it asks which
one you mean instead of guessing. The choice is remembered, so after the first
run just launch it with no arguments.

## Running from source

Needs Node 18+ and one `npm install`.

```sh
npm install
node tune.mjs
```

The cipher itself lives in
[`carmageddon-extractor`](https://github.com/edulazaro/carmageddon-extractor),
pulled in from npm, so there is only ever one copy of it.

### How the executable is built

There are three steps, and `sea.json` configures the middle one:

```
tune.mjs + its dependencies
      |  esbuild            bundles everything into one CommonJS file
      v
dist/bundle.cjs  (~90 KB)
      |  node --experimental-sea-config sea.json
      v
dist/sea-prep.blob          the program, in a form Node can carry inside itself
      |  postject            injects the blob into a copy of the node binary
      v
tuner.exe  (~67 MB)         a node binary that runs this app instead of a script
```

`sea.json` only names the bundle to embed and where to put the blob, plus a flag
that silences the "this is experimental" banner users would otherwise see on
every launch. Node insists on reading those settings from a file, which is why
it exists at all.

The first two steps run locally:

```sh
npm run build     # bundle with esbuild, then make the SEA blob
```

The injection step is platform-specific, so see
`.github/workflows/release.yml` for it. That workflow builds Windows, Linux and
macOS binaries on every tag.

`pkg`, the usual tool for this, is not used: its own dependency chain is broken
on current Node versions and it fails before it starts.

## What it edits

Everything the extractor can read:

- **The 41 cars** in `CARS/`
- **`OPPONENT.TXT`**, drivers and their strength ratings
- **`GENERAL.TXT`**, `RACES.TXT`, `POWERUP.TXT`, `PEDESTRN.TXT`,
  `PARTSHOP.TXT`, `DPOWERUP.TXT`, `SPECVOL.TXT`

Fields are discovered by reading the comments the files already carry
(`1.5  // mass in tonnes`), never by counting line numbers. Car files come in
three format versions with different fields, so anything positional breaks
silently on some of them.

A car file has thousands of editable lines, nearly all of them 3D model
geometry, so the menu leads with the values worth tuning: mass, top speed,
acceleration, gears, traction, turning radius, suspension, damping, ride height
and brakes. Everything else is reachable through the search option, which
filters by label or value.

## Safety

- **It never writes into the game folder.** Saving produces a separate output
  directory and you copy the files over yourself. Back up your originals first.
- **Only the lines you changed are re-encrypted.** Everything else is copied
  from the original bytes and never processed, so it cannot be corrupted.
- **Every file is verified before being written.** The result is decrypted
  again and compared against your edits. Any mismatch aborts, and nothing is
  written.
- Changes live in memory until you save, so quitting without saving changes
  nothing on disk.

## Getting the game

**You need your own copy of Carmageddon or the Carmageddon Max Pack.**

- [Steam](https://store.steampowered.com/app/282010/Carmageddon_Max_Pack/)
- [GOG](https://www.gog.com/game/carmageddon_max_pack)
- [G2A](https://www.g2a.com/carmageddon-max-pack-steam-key-global-i10000008297002?gtag=e7e5b5506b)

The GOG release is the handiest one for this: it is DRM-free and ships with
DOSBox already configured, so the data files sit right there on disk.

*Disclosure: the G2A link is an affiliate link. Steam and GOG are not.*

Background on the game, including how long it takes to beat, in Spanish:
[Carmageddon](https://duracionde.com/carmageddon) ·
[Carmageddon Max Pack](https://duracionde.com/carmageddon-max-pack)

## Legal

This reads and rewrites files from an installation you already own. Nothing is
bundled here: no game assets, no game data, only the code that edits them.

## Author

Edu Lázaro, [edulazaro.com](https://edulazaro.com)
