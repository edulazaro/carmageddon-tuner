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

## Usage

```sh
carmageddon-tuner [path-to-CARMA/DATA]

# for example
carmageddon-tuner "D:/Games/Carmageddon/CARMA/DATA"
```

The path is remembered between runs, so after the first time just run it with
no arguments.

## Running from source

Needs Node 18+ and one `npm install`.

```sh
npm install
node tune.mjs
```

The cipher itself lives in
[`carmageddon-extractor`](https://github.com/edulazaro/carmageddon-extractor),
pulled in from npm, so there is only ever one copy of it.

To build the standalone executable yourself:

```sh
npm run build     # bundles with esbuild, then makes the SEA blob
```

Then inject the blob into a copy of Node, exactly as
`.github/workflows/release.yml` does. That workflow builds Windows, Linux and
macOS binaries on every tag.

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

## Legal

**You need your own copy of Carmageddon or the Carmageddon Max Pack.** This
reads and rewrites files from an installation you already own. Nothing is
bundled here: no game assets, no game data, only the code that edits them.

## Author

Edu Lázaro, [edulazaro.com](https://edulazaro.com)
