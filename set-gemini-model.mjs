#!/usr/bin/env node
/**
 * set-gemini-model.mjs
 *
 * Set or show GEMINI_MODEL in .env for career-ops.
 *
 * Usage:
 *   node set-gemini-model.mjs --show
 *   node set-gemini-model.mjs gemini-2.0-flash
 *   node set-gemini-model.mjs --model gemini-1.5-pro
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(ROOT, '.env');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
career-ops — Gemini model switcher

USAGE
  npm run gemini:model -- --show
  npm run gemini:model -- gemini-2.0-flash
  npm run gemini:model -- --model gemini-1.5-pro

NOTES
  - Persists to .env as GEMINI_MODEL=<name>
  - gemini-eval.mjs reads GEMINI_MODEL automatically
`);
  process.exit(0);
}

function parseTargetModel(argv) {
  const modelFlagIndex = argv.indexOf('--model');
  if (modelFlagIndex !== -1 && argv[modelFlagIndex + 1]) {
    return argv[modelFlagIndex + 1].trim();
  }

  const positional = argv.find((arg) => !arg.startsWith('--'));
  return positional ? positional.trim() : '';
}

function readEnvFile() {
  if (existsSync(ENV_PATH)) return readFileSync(ENV_PATH, 'utf-8');
  return '';
}

function showCurrentModel() {
  const source = readEnvFile();
  const match = source.match(/^GEMINI_MODEL=(.+)$/m);
  if (!match) {
    console.log('GEMINI_MODEL is not set. Default is gemini-2.0-flash.');
    return;
  }
  console.log(`Current GEMINI_MODEL: ${match[1].trim()}`);
}

function upsertGeminiModel(rawContent, modelName) {
  const normalized = rawContent || '';
  const line = `GEMINI_MODEL=${modelName}`;

  if (/^GEMINI_MODEL=.*$/m.test(normalized)) {
    return normalized.replace(/^GEMINI_MODEL=.*$/m, line);
  }

  const needsTrailingNewline = normalized.length > 0 && !normalized.endsWith('\n');
  return `${normalized}${needsTrailingNewline ? '\n' : ''}${line}\n`;
}

if (args.includes('--show')) {
  showCurrentModel();
  process.exit(0);
}

const targetModel = parseTargetModel(args);
if (!targetModel) {
  console.error('No model provided. Use --show or pass a model name.');
  process.exit(1);
}

const currentContent = readEnvFile();
const updatedContent = upsertGeminiModel(currentContent, targetModel);
writeFileSync(ENV_PATH, updatedContent, 'utf-8');

console.log(`Updated GEMINI_MODEL to: ${targetModel}`);
console.log('Saved in .env');

const apiKeyMatch = updatedContent.match(/^GEMINI_API_KEY=(.+)$/m);
if (!apiKeyMatch || apiKeyMatch[1].trim() === 'your_gemini_api_key_here') {
  console.log(
    'Warning: GEMINI_API_KEY is missing or placeholder. gemini-eval.mjs will fail until you set a valid key in .env.'
  );
}
