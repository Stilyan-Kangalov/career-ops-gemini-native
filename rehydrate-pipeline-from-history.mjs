#!/usr/bin/env node
/**
 * Re-fill data/pipeline.md from data/scan-history.tsv when the inbox was cleared
 * but npm run scan adds 0 rows (everything is already deduped in history).
 *
 * Applies portals.yml title_filter by default (same logic as scan.mjs).
 *
 * Usage:
 *   node rehydrate-pipeline-from-history.mjs
 *   node rehydrate-pipeline-from-history.mjs --no-portals-filter
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';

const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const APPLICATIONS_PATH = 'data/applications.md';
const PORTALS_PATH = 'portals.yml';

const PENDIENTES = '## Pendientes';

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map((k) => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map((k) => k.toLowerCase());
  return (jobTitle) => {
    const lower = (jobTitle || '').toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

function loadApplicationUrls() {
  const seen = new Set();
  if (!existsSync(APPLICATIONS_PATH)) return seen;
  const text = readFileSync(APPLICATIONS_PATH, 'utf-8');
  for (const match of text.matchAll(/https?:\/\/[^\s|)]+/g)) {
    seen.add(match[0].trim());
  }
  return seen;
}

function parseScanHistory(content) {
  const rows = [];
  for (const line of content.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 5) continue;
    const url = parts[0].trim();
    const title = (parts[3] || '').trim();
    const company = (parts[4] || '').trim();
    if (url.startsWith('http')) rows.push({ url, title, company });
  }
  return rows;
}

function main() {
  const noFilter = process.argv.includes('--no-portals-filter');

  if (!existsSync(SCAN_HISTORY_PATH)) {
    console.error(`Missing ${SCAN_HISTORY_PATH}. Run npm run scan first.`);
    process.exit(1);
  }

  let titlePass = () => true;
  if (!noFilter) {
    if (!existsSync(PORTALS_PATH)) {
      console.error(`Missing ${PORTALS_PATH}. Use --no-portals-filter or restore portals.yml.`);
      process.exit(1);
    }
    const cfg = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
    titlePass = buildTitleFilter(cfg.title_filter);
  }

  const historyRows = parseScanHistory(readFileSync(SCAN_HISTORY_PATH, 'utf-8'));
  const appUrls = loadApplicationUrls();
  let pipelineText = existsSync(PIPELINE_PATH) ? readFileSync(PIPELINE_PATH, 'utf-8') : '';

  const inPipeline = new Set();
  for (const line of pipelineText.split('\n')) {
    const m = line.match(/^- \[[ xX]\]\s+(https?:\/\/\S+)/);
    if (m) inPipeline.add(m[1].trim().replace(/[|]+$/, ''));
  }

  const linesToAdd = [];
  const picked = new Set();

  let filtered = 0;
  for (const row of historyRows) {
    if (!titlePass(row.title)) {
      filtered++;
      continue;
    }
    if (appUrls.has(row.url)) continue;
    if (inPipeline.has(row.url)) continue;
    if (picked.has(row.url)) continue;
    picked.add(row.url);
    linesToAdd.push(`- [ ] ${row.url} | ${row.company} | ${row.title}`);
  }

  console.log(`Scan history rows: ${historyRows.length}`);
  console.log(`Skipped by title_filter: ${filtered}${noFilter ? ' (filter off)' : ''}`);
  console.log(`URLs already in pipeline checkboxes: ${inPipeline.size}`);

  if (linesToAdd.length === 0) {
    console.log('\nNothing to add. Either pipeline already lists these jobs, title_filter excludes them, or trackers reference the URLs.');
    return;
  }

  const block = `${linesToAdd.join('\n')}\n`;

  if (!pipelineText.trim()) {
    pipelineText = `${PENDIENTES}\n\n${block}`;
  } else if (!pipelineText.includes(PENDIENTES)) {
    pipelineText = `${pipelineText.trimEnd()}\n\n${PENDIENTES}\n\n${block}`;
  } else {
    const idx = pipelineText.indexOf(PENDIENTES);
    const after = idx + PENDIENTES.length;
    const next = pipelineText.indexOf('\n## ', after);
    const insertAt = next === -1 ? pipelineText.length : next;
    pipelineText = pipelineText.slice(0, insertAt) + '\n' + block + pipelineText.slice(insertAt);
  }

  if (!pipelineText.endsWith('\n')) pipelineText += '\n';
  writeFileSync(PIPELINE_PATH, pipelineText, 'utf-8');
  console.log(`\nWrote ${linesToAdd.length} new pending line(s) to ${PIPELINE_PATH}`);
}

main();
