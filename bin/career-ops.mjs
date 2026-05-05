#!/usr/bin/env node
/**
 * career-ops / c-ops — interactive menu + script launcher
 *
 *   No args (TTY)              → arrow-key menu
 *   c-ops --menu | -m          → menu
 *   c-ops <command> [...]      → run cli/registry.mjs commands (full names: scan, verify, …)
 *
 *   CI=1 | NO_MENU=1 + no args → print help (no menu)
 */

import { runArgv, printHelpText } from '../cli/registry.mjs';
import { runInteractiveMenu } from '../cli/interactive.mjs';

const argv = process.argv.slice(2);

async function main() {
  const forceMenu =
    argv[0] === '--menu' || argv[0] === '-m' || argv[0] === 'menu';
  const skipMenu = process.env.CI === '1' || process.env.NO_MENU === '1';

  if (forceMenu) {
    await runInteractiveMenu();
    return;
  }

  if (argv.length === 0) {
    if (skipMenu || !process.stdin.isTTY) {
      printHelpText();
      process.exit(0);
    }
    await runInteractiveMenu();
    return;
  }

  process.exit(runArgv(argv));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
