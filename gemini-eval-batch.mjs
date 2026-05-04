#!/usr/bin/env node
/**
 * Run gemini-eval.mjs sequentially on batch/input-jds/*.md (terminal batch).
 *
 * Use this when the agent wrongly runs `/career-ops-batch` in bash — that path
 * does not exist; /career-ops-batch is a Gemini CLI *chat* slash command only.
 *
 * Usage:
 *   npm run gemini:eval:batch
 *   npm run gemini:eval:batch -- --max 5
 *   npm run gemini:eval:batch -- --dir batch/input-jds --max 2
 */

import { spawnSync } from 'child_process';
import { readdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(ROOT, 'batch', 'input-jds');
const DEFAULT_MAX = 3;

function parseArgs(argv) {
  let max = DEFAULT_MAX;
  let dir = DEFAULT_DIR;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max' && argv[i + 1]) max = Number(argv[++i]);
    else if (argv[i] === '--dir' && argv[i + 1]) dir = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`
Usage:
  npm run gemini:eval:batch
  npm run gemini:eval:batch -- --max 5
  npm run gemini:eval:batch -- --dir ./batch/input-jds --max 2

Requires GEMINI_API_KEY in .env (same as gemini-eval.mjs).
`);
      process.exit(0);
    }
  }
  if (!Number.isFinite(max) || max <= 0) {
    console.error('Invalid --max');
    process.exit(1);
  }
  return { max, dir };
}

const { max, dir } = parseArgs(process.argv.slice(2));

if (!existsSync(dir)) {
  console.error(`Directory not found: ${dir}`);
  process.exit(1);
}

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && f !== '.gitkeep')
  .sort();

const slice = files.slice(0, max);

if (slice.length === 0) {
  console.log(`No .md files in ${dir}. Run npm run jds:generate first.`);
  process.exit(0);
}

console.log(`Running gemini-eval.mjs on ${slice.length} file(s) (max=${max})\n`);

for (const f of slice) {
  const fp = join(dir, f);
  console.log(`\n${'━'.repeat(50)}\n▶ ${f}\n${'━'.repeat(50)}\n`);
  const r = spawnSync(process.execPath, [join(ROOT, 'gemini-eval.mjs'), '--file', fp], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error(`\nStopped: gemini-eval.mjs exited with code ${r.status} on ${f}`);
    process.exit(r.status ?? 1);
  }
}

console.log(`\nDone. Evaluated ${slice.length} file(s).`);
