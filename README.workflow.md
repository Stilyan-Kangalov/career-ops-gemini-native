# Career-Ops — Cursor workflow

This document is the **single place** we record how to run this project **from Cursor** (chat + Agent + integrated terminal). It assumes you are **not** relying on Claude Code, Gemini CLI, or OpenCode slash commands. Optional tools like those can still exist in the repo, but they are **not** required for the workflow below.

For upstream marketing copy, multilingual READMEs, and the full feature tour, see **`README.md`**. For legal and data boundaries, see **`DATA_CONTRACT.md`**.

---

## What you are running

- **Cursor** — reasoning, evaluations, CV tailoring, editing `modes/` and your personal files.
- **Node.js** — automation scripts (`scan`, PDF export, pipeline verification, HTML export).
- **This repository** — modes (prompts), `cv.md`, `config/profile.yml`, tracker, reports.

You do **not** need Gemini API keys or separate AI CLIs for this workflow. Cursor provides the model access you use day to day.

---

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 18+** | For all `.mjs` scripts |
| **npm dependencies** | `npm install` |
| **Playwright Chromium** | `npx playwright install chromium` — needed for **`npm run pdf`** |
| **Optional: Go 1.21+** | Only if you build the **`dashboard/`** TUI |

---

## One-time setup

1. **Install**

   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Profile**

   ```bash
   cp config/profile.example.yml config/profile.yml
   ```

   Edit **`config/profile.yml`** with your name, targets, compensation band, narrative.

3. **CV**

   Create **`cv.md`** in the project root (Markdown). This is the canonical CV for evaluations and PDF generation.

4. **Portals (scanner)**

   ```bash
   cp templates/portals.example.yml portals.yml
   ```

   Adjust keywords and companies for your search.

5. **Tracker and pipeline files**

   Ensure these exist (create empty structures if needed):

   - **`data/applications.md`** — application tracker table  
   - **`data/pipeline.md`** — inbox with **`## Pendientes`** and **`## Procesadas`**  
   - **`data/scan-history.tsv`** — created automatically when you run **`npm run scan`**

   The scanner creates **`data/pipeline.md`** with the right sections if it is missing.

6. **Sanity check**

   ```bash
   npm run doctor
   npm run sync-check
   ```

---

## Where your data lives (short)

| Layer | Examples |
|-------|-----------|
| **Yours (personalize here)** | `cv.md`, `config/profile.yml`, `modes/_profile.md`, `portals.yml`, `data/*`, `reports/*`, `output/*` |
| **System (updates may touch)** | `modes/_shared.md`, most other `modes/*.md`, scripts, `templates/*` |

User-specific preferences belong in **`modes/_profile.md`** or **`config/profile.yml`**, not in **`modes/_shared.md`**.

---

## Daily workflow

### 1. Discover roles

```bash
npm run scan
```

Reads **`portals.yml`**, hits public ATS APIs (Greenhouse, Ashby, Lever where configured), deduplicates, and appends new rows under **`## Pendientes`** in **`data/pipeline.md`**.

### 2. Evaluate offers (Cursor)

There is **no** terminal command that replaces “evaluate this job.” In **Cursor Chat / Agent**:

- Paste a job URL or JD text, **or** reference a file under **`jds/`** or **`batch/input-jds/`**.
- Ask the agent to follow your evaluation mode (see **`modes/oferta.md`** and **`modes/_shared.md`** for structure).
- Output should become a report under **`reports/`** with the naming convention described in **`CLAUDE.md`** (sequential `###-company-slug-YYYY-MM-DD.md`), including **`**URL:**`** and legitimacy (**Block G**).

### 3. Process the pipeline inbox

When **`data/pipeline.md`** has unchecked lines in **`## Pendientes`**:

- In Cursor, ask the agent to **process the pipeline** using **`modes/pipeline.md`** (fetch JD per URL with browser tools when available, evaluate, write reports, update tracker).
- Move processed lines to **`## Procesadas`** with scores and report references.

Large backlogs are best done in **batches** (for example a few roles per session) so evaluations stay thorough.

### 4. Tailored CV / PDF

After you agree on tailored content:

```bash
npm run pdf
```

Uses Playwright to render the HTML CV workflow into **`output/`**. Review files before applying.

### 5. Tracker

Maintain **`data/applications.md`** as the source of truth. After edits:

```bash
npm run verify
```

### 6. HTML export (reports + tracker)

To browse evaluations in a browser:

```bash
npm run export-html
```

Writes **`output/html/index.html`** plus one HTML file per linked report. Regenerate after new evaluations.

### 7. Dashboard (optional)

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard --path ..
```

Requires **`data/applications.md`** and Go installed.

---

## Interactive CLI (menus)

The **`c-ops`** command (same binary as **`career-ops`**) opens an **interactive, arrow-key menu** (grouped sections + hints). Commands use **full names** only (e.g. `scan`, `verify`, `update-check`) — no one-letter shortcuts.

### Making `c-ops` available

After **`npm install`**, use **`npm run c-ops`** so you never type **`node bin/career-ops.mjs`**:

```bash
cd /path/to/career-ops-gemini-native
npm install          # once (includes @inquirer/prompts + picocolors)

npm run c-ops -- --menu       # interactive menu
npm run c-ops -- verify
npm run c-ops -- update-check

# Same via npm script alias:
npm run cli -- verify
```

Put **`c-ops`** on your **PATH** with **`npm link`** (or **`npm install -g .`**), then use the short form everywhere:

```bash
npm link             # once per clone / machine

c-ops                # TTY → menu
c-ops --menu
c-ops verify
career-ops verify    # identical binary
```

**Fallback** (no npm link): `node bin/career-ops.mjs …`

**Shell note:** Commands that contain **`:`** (e.g. Gemini) must be quoted in zsh/bash:

```bash
c-ops 'gemini:eval' --file ./jds/x.md
# or:
npm run c-ops -- 'gemini:eval' --file ./jds/x.md
```

```bash
# Menu when stdin is a TTY; otherwise prints help
CI=1 c-ops
NO_MENU=1 c-ops
```

Implementation: **`cli/interactive.mjs`** (menu), **`cli/registry.mjs`** (commands), **`bin/career-ops.mjs`** (entry).

---

## Command cheat sheet (non-interactive)

Same behavior as **`npm run …`**: forwards to root `*.mjs` scripts.

| Command | Purpose |
|---------|---------|
| `c-ops doctor` | Prerequisites (`doctor.mjs`) |
| `c-ops scan` | Portal scan → **`data/pipeline.md`** |
| `c-ops verify` | Tracker + report integrity |
| `c-ops sync-check` | CV vs **`config/profile.yml`** |
| `c-ops pdf` | CV → PDF |
| `c-ops export-html` | **`output/html/`** from tracker + reports |
| `c-ops jds-generate` | Pipeline URLs → **`batch/input-jds/`** |
| `c-ops update check` **or** `c-ops update-check` | Template update check |
| `c-ops update-apply` / `update-rollback` / `update-dismiss` | Update lifecycle |

(`career-ops …` works the same after **`npm link`**.)

Optional synonyms (still words, not letters): **`html`** → `export-html`, **`jds`** → `jds-generate`, **`rehydrate`** → `pipeline-rehydrate`.

Full list: **`c-ops --help`** or **`npm run c-ops -- --help`** or menu → **Command reference**.

---

## Ethics (non-negotiable)

- The system is a **filter**, not a mass-application bot. Treat scores and recommendations seriously.
- **Do not submit applications** without your own review. The AI drafts; you decide.

---

## Keeping this document current

When you change how you work (new scripts, new folders, new conventions), update **`README.workflow.md`** in the same PR or commit so the Cursor-first path stays accurate.

---

## See also

| Document | Role |
|----------|------|
| **`CLAUDE.md`** | Full agent rules, data contract summary, tracker TSV format |
| **`DATA_CONTRACT.md`** | User vs system file boundaries |
| **`docs/SETUP.md`** | Detailed setup (includes optional CLIs) |
| **`docs/SCRIPTS.md`** | Script-by-script reference |
| **`AGENTS.md`** | Short pointer for Codex / IDE agents |
