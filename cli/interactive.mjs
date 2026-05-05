/**
 * Interactive menu (arrow keys + Enter) — similar UX to Gemini CLI pickers.
 */

import readline from 'readline';
import { select, Separator } from '@inquirer/prompts';
import pc from 'picocolors';
import {
  MENU_SECTIONS,
  runArgv,
  readVersion,
  ROOT,
  printHelpText,
} from './registry.mjs';

function banner() {
  const v = readVersion();
  const rootShort = ROOT.length > 56 ? '…' + ROOT.slice(-54) : ROOT;
  console.log(
    pc.cyan(`
  ╔══════════════════════════════════════════════════════════╗
  ║  ${pc.bold(pc.white('Career-Ops'))}  ${pc.dim('v' + v)}
  ║  ${pc.dim(rootShort)}
  ╚══════════════════════════════════════════════════════════╝`)
  );
  console.log(pc.dim('  ↑↓ navigate · Enter run · Ctrl+C quit\n'));
}

function buildChoices() {
  const choices = [];

  for (const section of MENU_SECTIONS) {
    choices.push(new Separator(` ── ${section.title} ── `));
    for (const item of section.items) {
      choices.push({
        name: `${item.label}  ${pc.dim(item.hint || '')}`,
        value: item.value,
        description: item.hint ? pc.dim(item.hint) : undefined,
      });
    }
  }

  choices.push(new Separator(pc.dim(' ──────────────────────────────────────────────── ')));
  choices.push({
    name: pc.bold('Command reference') + '  ' + pc.dim('print full help'),
    value: '__help',
    description: pc.dim('Same as: c-ops --help'),
  });
  choices.push({
    name: pc.bold('Exit'),
    value: '__exit',
    description: pc.dim('Close menu'),
  });

  return choices;
}

export async function runInteractiveMenu() {
  banner();

  while (true) {
    let choice;
    try {
      choice = await select({
        message: pc.bold('What would you like to run?'),
        choices: buildChoices(),
        pageSize: 14,
        loop: false,
      });
    } catch {
      console.log(pc.dim('\nBye.\n'));
      process.exit(0);
    }

    if (choice === '__exit') {
      console.log(pc.dim('\nBye.\n'));
      process.exit(0);
    }

    if (choice === '__help') {
      printHelpText();
      console.log(pc.dim('\n── Press Enter to return to the menu…'));
      await waitEnter();
      banner();
      continue;
    }

    const code = runArgv([choice]);
    if (code !== 0) {
      console.log(pc.yellow(`\nExit code: ${code}`));
    }

    console.log(pc.dim('\n── Done. Press Enter for menu…'));
    await waitEnter();
    banner();
  }
}

function waitEnter() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      resolve();
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}
