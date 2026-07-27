/* ========================================
   PROJECT: everything that touches disk lives here, so the UI stays about
   asking questions and printing things.

   A "project" is a game installation plus the edits made against it. Edits are
   kept in memory as `file -> {lineIndex: newValue}` and only reach the disk
   when the user saves, which is what makes "show me what changed before you
   write" possible.

   NOTHING is ever written into the game folder. Saving produces a separate
   output directory that the user copies over themselves.

   Edu Lázaro, https://edulazaro.com
======================================== */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { decryptFile, decryptLine, encryptLine } from 'carmageddon-extractor/decrypt';
import { readFields, applyEdits, isHighlight } from 'carmageddon-extractor/fields';

/* Top-level data files worth offering, same list extract.mjs uses. Which ones
   exist varies by release, so missing ones are simply skipped. */
const DATA_FILES = ['OPPONENT.TXT', 'GENERAL.TXT', 'RACES.TXT', 'POWERUP.TXT',
                    'PEDESTRN.TXT', 'PARTSHOP.TXT', 'DPOWERUP.TXT', 'SPECVOL.TXT'];

const SETTINGS = path.join(os.homedir(), '.carmageddon-tuner.json');

/** Remembers the last game folder, so it is offered as the default next time. */
export function loadSettings() {
    try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; }
}
export function saveSettings(s) {
    try { fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2), 'utf8'); } catch { /* not critical */ }
}

/** Case-insensitive lookup, since installs differ in casing. */
function resolveIn(dir, name) {
    if (!fs.existsSync(dir)) return null;
    const hit = fs.readdirSync(dir).find(f => f.toLowerCase() === name.toLowerCase());
    return hit ? path.join(dir, hit) : null;
}

/** Checks a folder really is a CARMA/DATA directory. */
export function looksLikeGameData(dir) {
    if (!dir || !fs.existsSync(dir)) return false;
    return Boolean(resolveIn(dir, 'GENERAL.TXT') || resolveIn(dir, 'CARS'));
}

export function createProject(gameDir) {
    /* file key -> Map(lineIndex -> newValue). Cleared on save. */
    const edits = new Map();
    /* Decrypted text cache, so reopening a file is instant. */
    const cache = new Map();

    /** Every editable target: the 41 cars plus the top-level data files. */
    function listTargets() {
        const out = [];
        const carsDir = resolveIn(gameDir, 'CARS');
        if (carsDir) {
            for (const f of fs.readdirSync(carsDir).filter(f => /\.txt$/i.test(f))) {
                out.push({ key: 'CARS/' + f, name: f.replace(/\.TXT$/i, ''), kind: 'car',
                           file: path.join(carsDir, f) });
            }
        }
        for (const f of DATA_FILES) {
            const p = resolveIn(gameDir, f);
            if (p) out.push({ key: f, name: f.replace(/\.TXT$/i, ''), kind: 'data', file: p });
        }
        return out;
    }

    function textOf(target) {
        if (!cache.has(target.key)) cache.set(target.key, decryptFile(target.file));
        return cache.get(target.key);
    }

    /** Fields of a target, with any pending edit already reflected. */
    function fieldsOf(target) {
        const pending = edits.get(target.key);
        return readFields(textOf(target)).map(f => ({
            ...f,
            edited: pending?.has(f.index) ?? false,
            value: pending?.has(f.index) ? pending.get(f.index) : f.value,
            highlight: isHighlight(f.label),
        }));
    }

    function setField(target, index, value) {
        if (!edits.has(target.key)) edits.set(target.key, new Map());
        const original = readFields(textOf(target)).find(f => f.index === index);
        const m = edits.get(target.key);
        /* Setting a field back to its original value clears the edit, so the
           change list never shows no-op entries. */
        if (original && original.value === String(value)) m.delete(index);
        else m.set(index, String(value));
        if (!m.size) edits.delete(target.key);
    }

    /** Flat list of pending changes, for the confirmation screen. */
    function pendingChanges() {
        const out = [];
        for (const [key, m] of edits) {
            const target = listTargets().find(t => t.key === key);
            if (!target) continue;
            const originals = readFields(textOf(target));
            for (const [index, value] of m) {
                const o = originals.find(f => f.index === index);
                out.push({ key, name: target.name, line: index + 1,
                           label: o?.label || '', from: o?.value ?? '', to: value });
            }
        }
        return out;
    }

    function hasChanges() { return edits.size > 0; }

    /* Writes the edited files into `outDir`, following the extractor's rule:
       only the lines that changed get re-encrypted, everything else is copied
       from the original bytes and never processed. Each file is verified by
       decrypting the result and comparing it against the intended text. */
    function save(outDir) {
        if (path.resolve(outDir).startsWith(path.resolve(gameDir))) {
            throw new Error('refusing to write inside the game folder');
        }
        const report = [];
        for (const [key, m] of edits) {
            const target = listTargets().find(t => t.key === key);
            if (!target) continue;

            const originalLines = fs.readFileSync(target.file, 'latin1').split('\r\n');
            const wanted = applyEdits(textOf(target), m).split('\r\n');

            const out = originalLines.slice();
            for (const [index] of m) {
                if (!originalLines[index]?.startsWith('@')) {
                    throw new Error(`${target.name} line ${index + 1} is stored unencrypted; not supported`);
                }
                out[index] = '@' + encryptLine(wanted[index]);
            }

            /* Verify: decrypt what we built and demand it matches, exactly. */
            for (let i = 0; i < wanted.length; i++) {
                const back = out[i].startsWith('@') ? decryptLine(out[i].slice(1)) : out[i];
                if (back !== wanted[i]) {
                    throw new Error(`${target.name}: verification failed on line ${i + 1}; nothing written`);
                }
            }

            const dst = path.join(outDir, key);
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.writeFileSync(dst, out.join('\r\n'), 'latin1');
            report.push({ name: target.name, path: dst, lines: m.size });
        }
        edits.clear();
        return report;
    }

    function discard() { edits.clear(); }

    return { gameDir, listTargets, fieldsOf, setField, pendingChanges, hasChanges, save, discard };
}
