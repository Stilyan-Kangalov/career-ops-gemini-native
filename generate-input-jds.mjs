#!/usr/bin/env node
/**
 * generate-input-jds.mjs
 *
 * Build batch/input-jds/*.md from pending URLs in data/pipeline.md.
 * Default is intentionally conservative (3 files) for free-tier token safety.
 *
 * Usage:
 *   node generate-input-jds.mjs
 *   node generate-input-jds.mjs --max 3
 *   node generate-input-jds.mjs --max 10   # paid users
 *   node generate-input-jds.mjs --source data/pipeline.md --out batch/input-jds
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename } from 'path';
import yaml from 'js-yaml';

const DEFAULT_MAX = 3;
const DEFAULT_FETCH_TIMEOUT_MS = 25000;

/** Browser-like UA reduces blank/blocked ATS HTML responses from naive fetch(). */
const FETCH_HEADERS_HTML = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

function parseArgs(argv) {
  const args = {
    max: DEFAULT_MAX,
    source: 'data/pipeline.md',
    out: 'batch/input-jds',
    portals: 'portals.yml',
    usePortalsFilter: true,
    fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    fetchRetries: 2,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--max' && argv[i + 1]) args.max = Number(argv[++i]);
    else if (arg === '--source' && argv[i + 1]) args.source = argv[++i];
    else if (arg === '--out' && argv[i + 1]) args.out = argv[++i];
    else if (arg === '--portals' && argv[i + 1]) args.portals = argv[++i];
    else if (arg === '--timeout' && argv[i + 1]) args.fetchTimeoutMs = Number(argv[++i]);
    else if (arg === '--retries' && argv[i + 1]) args.fetchRetries = Number(argv[++i]);
    else if (arg === '--no-portals-filter') args.usePortalsFilter = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
career-ops — Generate input JDs for batch

USAGE
  npm run jds:generate
  npm run jds:generate -- --max 3
  npm run jds:generate -- --max 10

OPTIONS
  --max <N>       Max files to generate (default: 3)
  --source <path> Pipeline file to read (default: data/pipeline.md)
  --out <path>    Output folder (default: batch/input-jds)
  --portals <path> portals.yml for title_filter (default: portals.yml)
  --timeout <ms>  Per-request timeout (default: ${DEFAULT_FETCH_TIMEOUT_MS})
  --retries <n>   Retry count on network failure (default: 2)
  --no-portals-filter  Take first N pending URLs without title filtering

NOTES
  - Default max=3 is recommended for free-tier token control.
  - Paid users can increase with --max.
  - By default, only pending lines whose title passes portals.yml title_filter are generated (same logic as scan.mjs).
  - Ashby / Lever / Greenhouse URLs use public posting APIs when possible so location & description stay structured.
`);
}

function extractPendingOffers(markdown) {
  const offers = [];
  const seen = new Set();
  for (const line of markdown.split('\n')) {
    // Expected: - [ ] https://... | Company | Role
    const m = line.match(/^- \[ \]\s+(https?:\/\/\S+)\s*(?:\|\s*([^|]+)\s*\|\s*(.+))?$/);
    if (!m) continue;
    const url = m[1].trim().replace(/[|]+$/, '');
    const company = (m[2] || '').trim();
    const title = (m[3] || '').trim();
    if (!seen.has(url)) {
      seen.add(url);
      offers.push({ url, company, title, line });
    }
  }
  return offers;
}

function buildTitleFilter(titleFilter) {
  const positive = (titleFilter?.positive || []).map((k) => k.toLowerCase());
  const negative = (titleFilter?.negative || []).map((k) => k.toLowerCase());

  return (jobTitle) => {
    const lower = jobTitle.toLowerCase();
    const hasPositive = positive.length === 0 || positive.some((k) => lower.includes(k));
    const hasNegative = negative.some((k) => lower.includes(k));
    return hasPositive && !hasNegative;
  };
}

/** Greenhouse/Ashby sometimes ship HTML entity-encoded blobs — decode before tag stripping. */
function decodeHtmlEntities(html) {
  let out = String(html);
  let prev;
  let guard = 0;
  do {
    prev = out;
    out = out
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/g, '&');
    guard++;
  } while (out !== prev && guard < 8);
  return out;
}

function stripHtml(html) {
  let s = decodeHtmlEntities(html);
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugFromUrl(url, index) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '-');
    const pathPart = u.pathname.split('/').filter(Boolean).slice(-2).join('-');
    const cleanPath = pathPart.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-').toLowerCase();
    return `${String(index + 1).padStart(2, '0')}-${host}-${cleanPath || 'job'}.md`;
  } catch {
    return `${String(index + 1).padStart(2, '0')}-job.md`;
  }
}

async function withRetries(operation, retries) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries) throw err;
    }
  }
  throw lastErr;
}

function createFetchers(timeoutMs, retries) {
  async function fetchText(url, headers = FETCH_HEADERS_HTML) {
    return withRetries(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    }, retries);
  }

  async function fetchJson(url, headers = { Accept: 'application/json' }) {
    return withRetries(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    }, retries);
  }

  return { fetchText, fetchJson };
}

function prependStructuredMeta(metaLines, body) {
  const trimmed = (body || '').trim();
  if (!metaLines?.length) return trimmed;
  const block = `## Workplace & location (from ATS API)\n\n${metaLines.map((l) => `- ${l}`).join('\n')}`;
  return trimmed ? `${block}\n\n---\n\n${trimmed}` : block;
}

function gatherStructuredStrings(job) {
  const blocks = [];
  // Title / location / workplace live in ATS-specific meta sections or markdown H1 — avoid duplicate noisy headers here.

  const htmlCandidates = [
    job.descriptionHtml,
    job.description,
    job.content,
    job.requirementsHtml,
    job.responsibilitiesHtml,
  ].filter(Boolean);

  for (const html of htmlCandidates) {
    const text = stripHtml(String(html));
    if (text) blocks.push(text);
  }

  const textCandidates = [
    job.descriptionPlain,
    job.summary,
    job.requirements,
    job.responsibilities,
    job.additionalInfo,
  ].filter(Boolean);

  for (const v of textCandidates) {
    if (Array.isArray(v)) {
      const lines = v.map((x) => `- ${String(x).trim()}`).join('\n');
      if (lines.trim()) blocks.push(lines);
    } else {
      const text = String(v).trim();
      if (text) blocks.push(text);
    }
  }

  return blocks.join('\n\n').trim();
}

function ashbyMetaLines(job) {
  const lines = [];
  if (job.location) lines.push(`Location: ${job.location}`);
  if (Array.isArray(job.secondaryLocations) && job.secondaryLocations.length)
    lines.push(`Other locations: ${job.secondaryLocations.join('; ')}`);
  if (typeof job.isRemote === 'boolean') lines.push(`Listed remote-friendly: ${job.isRemote}`);
  if (job.workplaceType) lines.push(`Workplace type: ${job.workplaceType}`);
  if (job.employmentType) lines.push(`Employment type: ${job.employmentType}`);
  if (job.department) lines.push(`Department: ${job.department}`);
  if (job.team) lines.push(`Team: ${job.team}`);
  if (job.compensation != null) {
    const c = job.compensation;
    lines.push(
      `Compensation (when listed): ${typeof c === 'string' || typeof c === 'number' ? c : JSON.stringify(c)}`
    );
  }
  return lines;
}

function leverMetaLines(job) {
  const lines = [];
  if (job.workplaceType) lines.push(`Workplace type: ${job.workplaceType}`);
  if (job.country) lines.push(`Country code: ${job.country}`);
  if (job.categories?.commitment) lines.push(`Commitment: ${job.categories.commitment}`);
  if (job.categories?.department) lines.push(`Department: ${job.categories.department}`);
  if (job.categories?.team) lines.push(`Team: ${job.categories.team}`);
  if (job.categories?.location) lines.push(`Primary hub / listing location: ${job.categories.location}`);
  if (Array.isArray(job.categories?.allLocations) && job.categories.allLocations.length) {
    const primary = job.categories?.location;
    const extra = primary
      ? job.categories.allLocations.filter((loc) => loc !== primary)
      : job.categories.allLocations;
    if (extra.length) lines.push(`Additional hubs: ${extra.join(', ')}`);
  }
  return lines;
}

function parseLeverPostingUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('jobs.lever.co')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { site: parts[0], postingId: parts[1] };
  } catch {
    return null;
  }
}

function parseGreenhouseJobUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('greenhouse.io')) return null;
    const m = u.pathname.match(/^\/([^/]+)\/jobs\/(\d+)\/?$/);
    if (!m) return null;
    return { board: m[1], jobId: m[2] };
  } catch {
    return null;
  }
}

async function tryFetchAshbyStructured(url, { fetchJson }) {
  const u = new URL(url);
  if (u.hostname !== 'jobs.ashbyhq.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const orgSlug = parts[0];
  const jobId = parts[1];
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${orgSlug}?includeCompensation=true`;
  const payload = await fetchJson(apiUrl);
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  const job = jobs.find((j) =>
    (j.id && String(j.id) === jobId) ||
    (j.jobUrl && String(j.jobUrl).includes(jobId))
  );
  if (!job) return null;

  const title = job.title || `${orgSlug} role`;
  const meta = ashbyMetaLines(job);
  const body = gatherStructuredStrings(job);
  const text = prependStructuredMeta(meta, body);
  return { provider: 'ashby-api', title, text };
}

async function tryFetchLeverStructured(url, { fetchJson }) {
  const parsed = parseLeverPostingUrl(url);
  if (!parsed) return null;
  const { site, postingId } = parsed;

  let job = null;
  try {
    job = await fetchJson(`https://api.lever.co/v0/postings/${site}/${postingId}`);
  } catch {
    const list = await fetchJson(`https://api.lever.co/v0/postings/${site}`);
    if (!Array.isArray(list)) return null;
    const norm = url.split('?')[0].replace(/\/$/, '');
    job = list.find(
      (j) =>
        j.id === postingId ||
        String(j.hostedUrl || '')
          .split('?')[0]
          .replace(/\/$/, '') === norm
    );
  }

  if (!job || typeof job !== 'object') return null;

  const title = job.text || `${site} role`;
  const meta = leverMetaLines(job);
  const plain =
    job.descriptionPlain ||
    job.descriptionBodyPlain ||
    stripHtml(job.descriptionHtml || job.descriptionBody || job.description || '').trim();
  const fallbackBody = plain || gatherStructuredStrings(job);
  const text = prependStructuredMeta(meta, fallbackBody);
  return { provider: 'lever-api', title, text };
}

async function tryFetchGreenhouseStructured(url, { fetchJson }) {
  const parsed = parseGreenhouseJobUrl(url);
  if (!parsed) return null;
  const { board, jobId } = parsed;
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`;
  const job = await fetchJson(apiUrl);
  if (!job || typeof job !== 'object') return null;

  const title = job.title || 'Job Description';
  const meta = [];
  if (job.location?.name) meta.push(`Location: ${job.location.name}`);
  const html = job.content || '';
  const body = stripHtml(html).trim();
  const text = prependStructuredMeta(meta, body || gatherStructuredStrings(job));
  return { provider: 'greenhouse-api', title, text };
}

async function extractJobContent(url, fetchers) {
  const { fetchText } = fetchers;

  try {
    const ashby = await tryFetchAshbyStructured(url, fetchers);
    if (ashby?.text?.trim()) return ashby;
  } catch {
    // Fall through to generic extraction if provider-specific extraction fails.
  }

  try {
    const lever = await tryFetchLeverStructured(url, fetchers);
    if (lever?.text?.trim()) return lever;
  } catch {
    // Continue to Greenhouse / HTML fallback.
  }

  try {
    const gh = await tryFetchGreenhouseStructured(url, fetchers);
    if (gh?.text?.trim()) return gh;
  } catch {
    // Continue to HTML fallback.
  }

  const html = await fetchText(url);
  const text = stripHtml(html).slice(0, 12000);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || 'Job Description')
    .replace(/\s+/g, ' ')
    .trim();
  return { provider: 'html-fallback', title, text };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  if (!Number.isFinite(args.max) || args.max <= 0) {
    console.error('Invalid --max value. Use a positive integer.');
    process.exit(1);
  }

  if (!Number.isFinite(args.fetchTimeoutMs) || args.fetchTimeoutMs < 5000) {
    console.error('Invalid --timeout. Use milliseconds >= 5000.');
    process.exit(1);
  }

  if (!Number.isFinite(args.fetchRetries) || args.fetchRetries < 0 || args.fetchRetries > 5) {
    console.error('Invalid --retries. Use 0–5.');
    process.exit(1);
  }

  if (!existsSync(args.source)) {
    console.error(`Source file not found: ${args.source}`);
    process.exit(1);
  }

  let titlePass = () => true;
  if (args.usePortalsFilter) {
    if (!existsSync(args.portals)) {
      console.error(`portals.yml not found at ${args.portals}. Copy templates/portals.example.yml or pass --no-portals-filter`);
      process.exit(1);
    }
    const portalsCfg = yaml.load(readFileSync(args.portals, 'utf-8'));
    titlePass = buildTitleFilter(portalsCfg.title_filter);
  }

  const sourceText = readFileSync(args.source, 'utf-8');
  const pendingOffers = extractPendingOffers(sourceText);
  if (pendingOffers.length === 0) {
    console.log(`No pending URLs found in ${args.source}.`);
    return;
  }

  mkdirSync(args.out, { recursive: true });
  writeFileSync(`${args.out}/.gitkeep`, '', 'utf-8');

  const selected = [];
  let skippedTitle = 0;
  for (const offer of pendingOffers) {
    const filterTitle = offer.title || offer.company || '';
    if (args.usePortalsFilter && filterTitle && !titlePass(filterTitle)) {
      skippedTitle++;
      continue;
    }
    selected.push(offer);
    if (selected.length >= args.max) break;
  }
  const date = new Date().toISOString().slice(0, 10);

  console.log(`Generating JD files from ${basename(args.source)}...`);
  console.log(`Pending lines: ${pendingOffers.length} | Selected: ${selected.length} (max=${args.max})`);
  if (args.usePortalsFilter) console.log(`Skipped by title_filter: ${skippedTitle}`);
  if (selected.length === 0) {
    console.log('No offers matched filters. Adjust portals.yml title_filter or use --no-portals-filter.');
    return;
  }
  if (args.max > DEFAULT_MAX) {
    console.log('Using max > 3. Ensure you are on paid tier or have sufficient token budget.');
  }

  const fetchers = createFetchers(args.fetchTimeoutMs, args.fetchRetries);

  let ok = 0;
  let fail = 0;
  for (let i = 0; i < selected.length; i++) {
    const offer = selected[i];
    const { url } = offer;
    const outputName = slugFromUrl(url, i);
    const outputPath = `${args.out}/${outputName}`;
    const inboxLine =
      offer.company || offer.title
        ? `**Pipeline inbox:** ${[offer.company, offer.title].filter(Boolean).join(' — ')}\n`
        : '';
    try {
      const extracted = await extractJobContent(url, fetchers);
      const text = (extracted.text || '').slice(0, 20000);
      const title = extracted.title || 'Job Description';

      const md = `# ${title}

${inboxLine}**Source URL:** ${url}  
**Snapshot date:** ${date}  
**Extraction method:** ${extracted.provider}

## Extracted Description

${text || 'No readable content extracted from page.'}
`;
      writeFileSync(outputPath, md, 'utf-8');
      ok++;
      console.log(`  + ${outputName}`);
    } catch (err) {
      fail++;
      const fallbackMd = `# Job Description (Fetch Failed)

${inboxLine}**Source URL:** ${url}  
**Snapshot date:** ${date}  
**Extraction method:** failed

## Extracted Description

Could not fetch this job description automatically (${err.message}).
Try opening the URL in browser and paste the JD text manually, or rerun generation later.
`;
      writeFileSync(outputPath, fallbackMd, 'utf-8');
      console.log(`  x ${outputName} (${err.message}) -> wrote fallback file`);
    }
  }

  console.log(`\nDone. Generated: ${ok}, Failed: ${fail}, Output: ${args.out}`);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
