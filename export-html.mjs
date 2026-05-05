#!/usr/bin/env node
/**
 * export-html.mjs — Build HTML from applications.md + linked report .md files
 *
 * Usage:
 *   node export-html.mjs
 *   node export-html.mjs --out output/html
 *   node export-html.mjs --tracker data/applications.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const ROOT = dirname(fileURLToPath(import.meta.url));

marked.use({
  gfm: true,
  breaks: false,
});

function parseArgs(argv) {
  const args = { out: join(ROOT, 'output', 'html'), tracker: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) args.out = join(ROOT, argv[++i]);
    else if (argv[i] === '--tracker' && argv[i + 1]) args.tracker = join(ROOT, argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  if (!args.tracker) {
    args.tracker = existsSync(join(ROOT, 'data/applications.md'))
      ? join(ROOT, 'data/applications.md')
      : join(ROOT, 'applications.md');
  }
  return args;
}

function parseApplicationsTable(content) {
  const lines = content.split('\n');
  const entries = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    if (line.includes('---') || line.match(/\|\s*#\s*\|/)) continue;
    const parts = line.split('|').map((s) => s.trim());
    if (parts.length < 9) continue;
    const num = parseInt(parts[1], 10);
    if (Number.isNaN(num)) continue;
    entries.push({
      num,
      date: parts[2],
      company: parts[3],
      role: parts[4],
      score: parts[5],
      status: parts[6],
      pdf: parts[7],
      report: parts[8],
      notes: parts[9] || '',
    });
  }
  return entries;
}

function extractReportPath(reportCell) {
  const m = reportCell.match(/\]\(([^)]+)\)/);
  return m ? m[1] : null;
}

function pageShell(title, innerHtml, extraHead = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  :root {
    --bg: #f8f9fc;
    --text: #1a1d26;
    --muted: #5c6578;
    --border: #e2e6ef;
    --accent: #3d5a9e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.55;
    color: var(--text);
    background: var(--bg);
  }
  .wrap { max-width: 52rem; margin: 0 auto; padding: 1.5rem 1.25rem 3rem; }
  .nav { margin-bottom: 1.5rem; font-size: 0.9rem; }
  .nav a { color: var(--accent); }
  h1 { font-size: 1.5rem; font-weight: 650; margin: 0 0 0.75rem; letter-spacing: -0.02em; }
  .meta { color: var(--muted); font-size: 0.9rem; margin-bottom: 1.5rem; }
  .content :where(h2, h3, h4) { margin-top: 1.75rem; margin-bottom: 0.5rem; font-weight: 650; }
  .content h2 { font-size: 1.2rem; border-bottom: 1px solid var(--border); padding-bottom: 0.35rem; }
  .content p { margin: 0.65rem 0; }
  .content ul, .content ol { margin: 0.5rem 0 0.5rem 1.25rem; }
  .content table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.92rem;
    margin: 1rem 0;
  }
  .content th, .content td {
    border: 1px solid var(--border);
    padding: 0.45rem 0.55rem;
    text-align: left;
    vertical-align: top;
  }
  .content th { background: #eef1f8; }
  .content pre {
    background: #1e2433;
    color: #e8ecf4;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.85rem;
  }
  .content code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.88em; }
  .content pre code { font-size: 0.82rem; }
  table.idx { width: 100%; border-collapse: collapse; font-size: 0.92rem; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  table.idx th { background: #eef1f8; text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); }
  table.idx td { padding: 0.55rem 0.75rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  table.idx tr:last-child td { border-bottom: none; }
  table.idx a { color: var(--accent); font-weight: 500; }
  .badge { display: inline-block; padding: 0.15rem 0.45rem; border-radius: 6px; background: #e8ecf8; font-size: 0.8rem; }
</style>
${extraHead}
</head>
<body>
<div class="wrap">
${innerHtml}
</div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`
Usage:
  node export-html.mjs [--out <dir>] [--tracker <path>]

Defaults:
  --out output/html   (relative to repo root)
  --tracker data/applications.md (or applications.md)

Writes:
  index.html              — table of all tracker rows with links
  report-<num>-<slug>.html — one page per report linked from the tracker
`);
    process.exit(0);
  }

  if (!existsSync(args.tracker)) {
    console.log(`\nNo tracker at ${args.tracker} — nothing to export.\n`);
    process.exit(0);
  }

  mkdirSync(args.out, { recursive: true });

  const md = readFileSync(args.tracker, 'utf-8');
  const entries = parseApplicationsTable(md);

  const rows = [];
  let written = 0;
  let skipped = 0;

  for (const e of entries) {
    const rel = extractReportPath(e.report);
    if (!rel) {
      skipped++;
      continue;
    }
    const absMd = join(ROOT, rel);
    if (!existsSync(absMd)) {
      console.warn(`⚠️  Missing report file for #${e.num}: ${rel}`);
      skipped++;
      continue;
    }

    const bodyMd = readFileSync(absMd, 'utf-8');
    const bodyHtml = marked.parse(bodyMd);
    const slug = basename(rel, '.md');
    const fileBase = `${String(e.num).padStart(3, '0')}-${slug}`;
    const htmlName = `${fileBase}.html`;
    const htmlPath = join(args.out, htmlName);

    const nav = `<div class="nav"><a href="index.html">← Applications</a></div>`;
    const title = `${e.company} — ${e.role}`;
    const meta = `<div class="meta">#${String(e.num).padStart(3, '0')} · ${escapeHtml(e.date)} · Score ${escapeHtml(e.score)} · ${escapeHtml(e.status)}</div>`;
    const inner = `${nav}<h1>${escapeHtml(title)}</h1>${meta}<article class="content">${bodyHtml}</article>`;

    writeFileSync(htmlPath, pageShell(title, inner), 'utf-8');
    written++;

    rows.push({
      num: e.num,
      date: e.date,
      company: e.company,
      role: e.role,
      score: e.score,
      status: e.status,
      notes: e.notes,
      html: htmlName,
    });
  }

  rows.sort((a, b) => a.num - b.num);

  const tableRows = rows
    .map(
      (r) =>
        `<tr><td><span class="badge">#${String(r.num).padStart(3, '0')}</span></td><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.company)}</td><td>${escapeHtml(r.role)}</td><td>${escapeHtml(r.score)}</td><td>${escapeHtml(r.status)}</td><td><a href="${escapeHtml(r.html)}">Open</a></td><td>${escapeHtml(r.notes)}</td></tr>`
    )
    .join('\n');

  const indexInner = `<h1>Applications</h1>
<p class="meta">Exported from <code>applications.md</code> — ${rows.length} report(s)</p>
<table class="idx">
<thead><tr><th>#</th><th>Date</th><th>Company</th><th>Role</th><th>Score</th><th>Status</th><th>Report</th><th>Notes</th></tr></thead>
<tbody>
${tableRows || '<tr><td colspan="8">No linked reports found.</td></tr>'}
</tbody>
</table>`;

  writeFileSync(join(args.out, 'index.html'), pageShell('Applications — career-ops', indexInner), 'utf-8');

  console.log(`\nexport-html: wrote ${written} report page(s)${skipped ? `, skipped ${skipped}` : ''}`);
  console.log(`→ ${join(args.out, 'index.html')}\n`);
}

main();
