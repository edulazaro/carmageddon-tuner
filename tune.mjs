#!/usr/bin/env node
/* ========================================
   CARMAGEDDON TUNER: a terminal UI for editing the game's car and opponent
   stats without hand-editing encrypted files.

   Works the same on Windows and Linux. Nothing is written into the game
   folder: saving produces a separate directory you copy over yourself.

   USAGE
     node tune.mjs [path-to-CARMA/DATA]

   The path is remembered between runs, so after the first time just run it.

   Edu Lázaro, https://edulazaro.com
======================================== */
import path from 'node:path';
import { select, input, confirm, search } from '@inquirer/prompts';
import { createProject, loadSettings, saveSettings, looksLikeGameData } from './lib/project.mjs';

/* Colours degrade to nothing when output is piped or the terminal is basic,
   which keeps old Windows consoles readable. */
const useColour = process.stdout.isTTY && process.env.TERM !== 'dumb';
const c = (code) => (s) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const dim = c('2'), bold = c('1'), amber = c('33'), green = c('32'), red = c('31');

/* Inquirer throws a specific error when the user hits Ctrl+C. Treat that as
   "go back" rather than letting it print a stack trace. */
const BACK = Symbol('back');
async function ask(fn) {
    try { return await fn(); }
    catch (e) {
        if (e?.name === 'ExitPromptError') return BACK;
        throw e;
    }
}

async function pickGameFolder() {
    const settings = loadSettings();
    let dir = process.argv[2] || settings.gameDir;

    while (!looksLikeGameData(dir)) {
        if (dir) console.log(red(`\nThat does not look like a CARMA/DATA folder: ${dir}`));
        const answer = await ask(() => input({
            message: 'Path to your CARMA/DATA folder',
            default: dir || '',
        }));
        if (answer === BACK) process.exit(0);
        dir = answer.trim().replace(/^["']|["']$/g, '');
    }

    if (settings.gameDir !== dir) saveSettings({ ...settings, gameDir: dir });
    return dir;
}

/** Formats one field as a menu row. */
function fieldRow(f) {
    const label = f.label || dim(`line ${f.index + 1}`);
    const value = f.edited ? green(f.value + ' *') : bold(f.value);
    return `${value}   ${dim('//')} ${label}`;
}

async function editField(project, target, field) {
    const answer = await ask(() => input({
        message: field.label || `line ${field.index + 1}`,
        default: field.value,
    }));
    if (answer === BACK) return;
    const value = answer.trim();
    if (value !== field.value) project.setField(target, field.index, value);
}

async function browseFields(project, target) {
    for (;;) {
        const all = project.fieldsOf(target);
        const highlights = all.filter(f => f.highlight);
        const edited = all.filter(f => f.edited);

        /* Cars carry thousands of fields, nearly all of them 3D model geometry.
           Leading with the tuning values keeps the menu usable; everything else
           is one search away. */
        const choices = [];
        if (highlights.length) {
            choices.push({ name: dim('--- main stats ---'), value: null, disabled: ' ' });
            for (const f of highlights) choices.push({ name: fieldRow(f), value: f });
        }
        if (edited.some(f => !f.highlight)) {
            choices.push({ name: dim('--- other edited ---'), value: null, disabled: ' ' });
            for (const f of edited.filter(f => !f.highlight)) {
                choices.push({ name: fieldRow(f), value: f });
            }
        }
        choices.push({ name: dim('--- ---'), value: null, disabled: ' ' });
        choices.push({ name: `Search all ${all.length} fields...`, value: 'search' });
        choices.push({ name: 'Back', value: 'back' });

        const pick = await ask(() => select({
            message: `${bold(target.name)}${dim('  (' + target.key + ')')}`,
            choices, pageSize: 18, loop: false,
        }));
        if (pick === BACK || pick === 'back' || pick == null) return;

        if (pick === 'search') {
            const found = await ask(() => search({
                message: 'Type to filter by label or value',
                source: async (term) => {
                    const t = (term || '').toLowerCase();
                    return all
                        .filter(f => !t || f.label.toLowerCase().includes(t) || f.value.toLowerCase().includes(t))
                        .slice(0, 40)
                        .map(f => ({ name: fieldRow(f), value: f }));
                },
            }));
            if (found !== BACK && found) await editField(project, target, found);
            continue;
        }

        await editField(project, target, pick);
    }
}

async function pickTarget(project) {
    const targets = project.listTargets();
    const cars = targets.filter(t => t.kind === 'car');
    const data = targets.filter(t => t.kind === 'data');

    const choices = [];
    if (cars.length) {
        choices.push({ name: dim(`--- cars (${cars.length}) ---`), value: null, disabled: ' ' });
        for (const t of cars) choices.push({ name: t.name, value: t });
    }
    if (data.length) {
        choices.push({ name: dim('--- game data ---'), value: null, disabled: ' ' });
        for (const t of data) choices.push({ name: t.name, value: t });
    }
    choices.push({ name: dim('--- ---'), value: null, disabled: ' ' });
    choices.push({ name: 'Back', value: 'back' });

    const pick = await ask(() => select({
        message: 'Pick a file to edit', choices, pageSize: 20, loop: false,
    }));
    return (pick === BACK || pick === 'back') ? null : pick;
}

function printChanges(changes) {
    console.log('');
    for (const ch of changes) {
        const what = ch.label || `line ${ch.line}`;
        console.log(`  ${bold(ch.name)}  ${what}`);
        console.log(`      ${red(ch.from)}  ->  ${green(ch.to)}`);
    }
    console.log('');
}

async function doSave(project) {
    const changes = project.pendingChanges();
    if (!changes.length) { console.log(dim('\nNothing to save.\n')); return; }

    console.log(bold(`\n${changes.length} change(s) pending:`));
    printChanges(changes);

    const where = await ask(() => input({
        message: 'Output folder (never the game folder)',
        default: path.resolve('packed'),
    }));
    if (where === BACK) return;

    const ok = await ask(() => confirm({ message: `Write to ${where}?`, default: true }));
    if (ok !== true) { console.log(dim('Cancelled.\n')); return; }

    try {
        const report = project.save(where);
        console.log(green(`\nWrote ${report.length} file(s):`));
        for (const r of report) console.log(`  ${r.path}  ${dim('(' + r.lines + ' line(s))')}`);
        console.log(amber('\nBack up your originals before copying these into the game.\n'));
    } catch (e) {
        console.log(red(`\nSave failed: ${e.message}`));
        console.log(dim('Nothing was written.\n'));
    }
}

async function main() {
    console.log(bold('\nCarmageddon Tuner') + dim('  ·  edulazaro.com\n'));

    const gameDir = await pickGameFolder();
    const project = createProject(gameDir);
    console.log(dim(`Game data: ${gameDir}\n`));

    for (;;) {
        const pending = project.pendingChanges().length;
        const pick = await ask(() => select({
            message: 'Main menu',
            choices: [
                { name: 'Edit a file', value: 'edit' },
                { name: `Review changes${pending ? amber(`  (${pending})`) : dim('  (none)')}`,
                  value: 'review' },
                { name: 'Save', value: 'save' },
                { name: 'Quit', value: 'quit' },
            ],
            loop: false,
        }));

        if (pick === BACK || pick === 'quit') {
            if (project.hasChanges()) {
                const sure = await ask(() => confirm({
                    message: `Discard ${project.pendingChanges().length} unsaved change(s)?`,
                    default: false,
                }));
                if (sure !== true) continue;
            }
            console.log(dim('\nBye.\n'));
            return;
        }

        if (pick === 'edit') {
            const target = await pickTarget(project);
            if (target) await browseFields(project, target);
        } else if (pick === 'review') {
            const changes = project.pendingChanges();
            if (!changes.length) console.log(dim('\nNo changes yet.\n'));
            else {
                printChanges(changes);
                const drop = await ask(() => confirm({ message: 'Discard all of them?', default: false }));
                if (drop === true) { project.discard(); console.log(dim('Discarded.\n')); }
            }
        } else if (pick === 'save') {
            await doSave(project);
        }
    }
}

main().catch(e => {
    if (e?.name === 'ExitPromptError') { console.log(dim('\nBye.\n')); process.exit(0); }
    console.error(red('\n' + (e?.message || e)));
    process.exit(1);
});
