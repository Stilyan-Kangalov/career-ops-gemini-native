/**
 * Command registry + execution for the career-ops CLI (full command names only).
 */

import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const NODE = process.execPath;

/** Optional readable synonyms → canonical COMMANDS key */
export const ALIASES = {
  html: 'export-html',
  jds: 'jds-generate',
  rehydrate: 'pipeline-rehydrate',
  'gemini-eval': 'gemini:eval',
  'gemini-batch': 'gemini:eval:batch',
  'gemini-model': 'gemini:model',
  'gemini-model-show': 'gemini:model:show',
};

/**
 * Long-form update commands (menu + argv) → update-system.mjs subcommand
 * Also supported:  c-ops update check|apply|rollback|dismiss
 */
export const UPDATE_COMMANDS = {
  'update-check': 'check',
  'update-apply': 'apply',
  'update-rollback': 'rollback',
  'update-dismiss': 'dismiss',
};

export const COMMANDS = {
  doctor: ['doctor.mjs'],
  verify: ['verify-pipeline.mjs'],
  scan: ['scan.mjs'],
  pdf: ['generate-pdf.mjs'],
  'export-html': ['export-html.mjs'],
  'sync-check': ['cv-sync-check.mjs'],
  merge: ['merge-tracker.mjs'],
  dedup: ['dedup-tracker.mjs'],
  normalize: ['normalize-statuses.mjs'],
  liveness: ['check-liveness.mjs'],
  'pipeline-rehydrate': ['rehydrate-pipeline-from-history.mjs'],
  'jds-generate': ['generate-input-jds.mjs'],
  'gemini:eval': ['gemini-eval.mjs'],
  'gemini:eval:batch': ['gemini-eval-batch.mjs'],
  'gemini:model': ['set-gemini-model.mjs'],
  'gemini:model:show': ['set-gemini-model.mjs', '--show'],
};

/** Menu: value is a single token for runArgv() */
export const MENU_SECTIONS = [
  {
    title: 'Workflow',
    items: [
      { label: 'Scan job portals → data/pipeline.md', value: 'scan', hint: 'c-ops scan' },
      { label: 'Verify tracker + report links', value: 'verify', hint: 'c-ops verify' },
      { label: 'Doctor (deps, cv.md, profile, Playwright)', value: 'doctor', hint: 'c-ops doctor' },
      { label: 'Generate CV PDF', value: 'pdf', hint: 'c-ops pdf' },
      { label: 'Export HTML (applications + reports)', value: 'export-html', hint: 'c-ops export-html' },
      { label: 'Sync check (cv vs profile.yml)', value: 'sync-check', hint: 'c-ops sync-check' },
    ],
  },
  {
    title: 'Tracker & pipeline',
    items: [
      { label: 'Merge batch TSVs → applications.md', value: 'merge', hint: 'c-ops merge' },
      { label: 'Dedupe applications.md', value: 'dedup', hint: 'c-ops dedup' },
      { label: 'Normalize statuses', value: 'normalize', hint: 'c-ops normalize' },
      { label: 'Generate JD files from pipeline URLs', value: 'jds-generate', hint: 'c-ops jds-generate' },
      { label: 'Rehydrate pipeline from history', value: 'pipeline-rehydrate', hint: 'c-ops pipeline-rehydrate' },
      { label: 'Liveness check (add URLs after command)', value: 'liveness', hint: 'c-ops liveness -- …' },
    ],
  },
  {
    title: 'Template updates',
    items: [
      { label: 'Check for career-ops updates', value: 'update-check', hint: 'c-ops update-check' },
      { label: 'Apply upstream update', value: 'update-apply', hint: 'c-ops update-apply' },
      { label: 'Rollback last update', value: 'update-rollback', hint: 'c-ops update-rollback' },
      { label: 'Dismiss update notice', value: 'update-dismiss', hint: 'c-ops update-dismiss' },
    ],
  },
  {
    title: 'Optional · Gemini API',
    items: [
      { label: 'Gemini: evaluate JD (API)', value: 'gemini:eval', hint: 'needs GEMINI_API_KEY' },
      { label: 'Gemini: eval batch folder', value: 'gemini:eval:batch', hint: 'c-ops gemini:eval:batch' },
      { label: 'Gemini: set model (pass args after command)', value: 'gemini:model', hint: 'c-ops gemini:model' },
      { label: 'Gemini: show current model', value: 'gemini:model:show', hint: 'c-ops gemini:model:show' },
    ],
  },
];

export function readVersion() {
  try {
    const p = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    return p.version || '?';
  } catch {
    return '?';
  }
}

export function expandToken(token) {
  if (!token) return null;
  const lower = token.toLowerCase();

  if (UPDATE_COMMANDS[lower]) {
    return { kind: 'update', sub: UPDATE_COMMANDS[lower] };
  }

  if (ALIASES[lower]) {
    return { kind: 'cmd', key: ALIASES[lower] };
  }

  if (COMMANDS[token]) return { kind: 'cmd', key: token };
  if (COMMANDS[lower]) return { kind: 'cmd', key: lower };

  return null;
}

export function resolveSpec(key) {
  const spec = COMMANDS[key];
  if (!spec) return null;
  const script = spec[0];
  const prefix = spec.slice(1);
  return { name: key, script, prefix };
}

/**
 * Run CLI argv (without node / career-ops prefix). Returns exit code.
 */
export function runArgv(argv) {
  if (argv.length === 0) return 0;

  if (argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    printHelpText();
    return 0;
  }

  if (argv[0] === 'version' || argv[0] === '-v' || argv[0] === '--version') {
    console.log(readVersion());
    return 0;
  }

  if (argv[0] === 'update') {
    const sub = argv[1];
    if (!sub || !['check', 'apply', 'rollback', 'dismiss'].includes(sub)) {
      console.error('Usage: c-ops update <check|apply|rollback|dismiss>\n');
      console.error('   or: c-ops update-check | update-apply | update-rollback | update-dismiss\n');
      return 1;
    }
    return runUpdate(sub, argv.slice(2));
  }

  const first = expandToken(argv[0]);
  if (!first) {
    console.error(`Unknown command: ${argv[0]}\n`);
    printHelpText();
    return 1;
  }

  if (first.kind === 'update') {
    return runUpdate(first.sub, argv.slice(1));
  }

  const resolved = resolveSpec(first.key);
  if (!resolved) {
    console.error(`Unknown command: ${argv[0]}\n`);
    printHelpText();
    return 1;
  }

  const scriptPath = join(ROOT, resolved.script);
  if (!existsSync(scriptPath)) {
    console.error(`Script missing: ${resolved.script}`);
    return 1;
  }

  const forward = [...resolved.prefix, ...argv.slice(1)];
  const r = spawnSync(NODE, [scriptPath, ...forward], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return r.status ?? 1;
}

export function runUpdate(sub, rest) {
  const scriptPath = join(ROOT, 'update-system.mjs');
  const r = spawnSync(NODE, [scriptPath, sub, ...rest], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  return r.status ?? 1;
}

export function printHelpText() {
  const v = readVersion();
  console.log(`
career-ops v${v}

Commands (use with: c-ops <command>  ·  npm run c-ops -- <command>  ·  node bin/career-ops.mjs <command>)

Workflow
  scan                 scan.mjs
  verify               verify-pipeline.mjs
  doctor               doctor.mjs
  pdf                  generate-pdf.mjs
  export-html          export-html.mjs  (alias: html)
  sync-check           cv-sync-check.mjs

Tracker & pipeline
  merge                merge-tracker.mjs
  dedup                dedup-tracker.mjs
  normalize            normalize-statuses.mjs
  jds-generate         generate-input-jds.mjs  (alias: jds)
  pipeline-rehydrate   rehydrate-pipeline-from-history.mjs  (alias: rehydrate)
  liveness             check-liveness.mjs

Template updates
  update check|apply|rollback|dismiss     → update-system.mjs
  update-check | update-apply | update-rollback | update-dismiss   (single token)

Optional · Gemini API
  gemini:eval
  gemini:eval:batch
  gemini:model
  gemini:model:show

Interactive menu
  c-ops                         # TTY: menu · CI=1: this help
  c-ops --menu | -m
  NO_MENU=1 c-ops

Examples
  c-ops scan
  c-ops export-html --out output/html
  c-ops update check
  c-ops update-rollback
`);
}
