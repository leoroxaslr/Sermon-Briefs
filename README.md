# Sermon Brief

Turn sermon slides, PDFs and transcripts into printable one-page briefs: the big idea, a summary, an outline, key quotes, takeaways, reflection questions, a weekly challenge and an optional closing prayer.

- **Reads almost anything:** PowerPoint (`.pptx`, including speaker notes), PDF, Word (`.docx`), slide images, and transcripts (`.txt`, `.md`, `.srt`, `.vtt`, or pasted text).
- **Reads text inside images:** slide pictures are scanned with on-device OCR (tesseract.js). This is free and runs on your machine.
- **Two writing engines:**
  - **Tavily AI** (recommended) uses Tavily Research with your Tavily credits. With the `mini` model, a brief has cost 10–70 credits in testing; longer sermons cost more.
  - **Local** is free and offline. It picks the strongest lines from your material and never invents content.
  - If Tavily fails or isn't set up, the app falls back to Local automatically and tells you so.
- **Stays in the preacher's words:** briefs are built from the sermon's own sentences. The app uses the sermon's numbered outline (I., II., A., B.) word for word and the sermon's own conclusion as the summary. Paraphrased lines are pulled back to the sentences they came from. Each brief shows its **% new wording** (target: under 10%), and **Highlight new wording** marks every word that isn't in the source.
- **Dashboard:** every brief is saved, searchable, editable, and can be regenerated with different sections or audiences.
- **Prints on one page:** the brief shrinks its type slightly to fit US Letter. Use **Print / Save PDF**.
- **No login:** it's meant to run on your own computer or a private network.

## Setup

Requires Node.js 24 or newer, which includes the built-in `node:sqlite` module.

```bash
npm install
cp .env.example .env.local   # then add your Tavily key
npm run dev                  # http://localhost:3000
```

In `.env.local`:

| Variable | Purpose |
| --- | --- |
| `TAVILY_API_KEY` | Your key from https://app.tavily.com. Optional: you can also save it in the app's **Settings** page. This variable takes precedence. |
| `TAVILY_RESEARCH_MODEL` | `mini` (default, 4–110 credits per brief) or `pro` (15–250 credits). |

`.env.local` is git-ignored. Never commit a real key.

For day-to-day use, run the production build, which is faster:

```bash
npm run build && npm start
```

## Windows desktop app

The app also ships as a Windows installer (`Sermon-Brief-Setup-<version>.exe`) that bundles everything: Node.js, the app, and the OCR model. It opens in its own window and needs no internet except for Tavily.

**Building it.** GitHub Actions builds the installer on Windows (`.github/workflows/windows-installer.yml`):

- **Any time:** open the repo's **Actions** tab → **Windows installer** → **Run workflow**. The `.exe` is attached to the run under *Artifacts*.
- **As a release:** bump `version` in `package.json`, then push a matching tag (`git tag v0.2.0 && git push origin v0.2.0`). The installer is published on the repo's **Releases** page.

Each build also starts the bundled server on Windows and runs a slide deck and a PDF through it, so a broken build fails before anyone installs it.

**Installing.** Run the `.exe`. It installs for the current user without admin rights and adds Start-menu and desktop shortcuts. The installer isn't code-signed yet, so Windows SmartScreen shows "Windows protected your PC". Click **More info → Run anyway**. Signing (e.g. Azure Trusted Signing, about $10/month) removes this warning.

**First run.** Open **Settings** and paste your Tavily API key. It's checked with Tavily (no credits used) and saved on that computer only.

**Data.** Briefs, settings and logs live in `%APPDATA%\Sermon Brief\`. In the app, **Help → Open data folder** goes there. Uninstalling keeps this folder, so reinstalling keeps your briefs. Back up `data\sermon-brief.db` to keep your history.

**Testing a build on a Mac:** `npm run desktop:build:local` produces `dist-desktop/mac-arm64/Sermon Brief.app` with the same layout.

## Where things live

| Path | What |
| --- | --- |
| `data/sermon-brief.db` | SQLite database of all briefs (git-ignored). Back this file up to keep your history. |
| `data/tessdata/` | OCR language model, downloaded once (~5 MB). |
| `src/lib/extract/` | File readers: PowerPoint, PDF, Word, transcripts and OCR. |
| `src/lib/ai/tavily.ts` | Tavily Research integration (structured JSON output). |
| `src/lib/ai/local.ts` | Free extractive engine. |
| `src/lib/jobs.ts` | Background pipeline: extract → write → save. |
| `src/app/api/briefs/` | Upload, status, edit, delete, regenerate and source-text endpoints. |
| `desktop/app/main.js` | Electron shell: starts the bundled server on a free local port and opens the window. |
| `desktop/scripts/prepare.mjs` | Assembles the server, Node.js and OCR model for packaging, and refuses to package local data. |
| `electron-builder.yml` | Installer settings. |

## Notes

- Processing runs inside the web server. If the server restarts mid-brief, that brief is marked failed and can be regenerated from the brief page.
- Older `.ppt` and `.doc` files aren't supported. Save them as `.pptx` or `.docx` first.
- There's no authentication. Don't expose the app directly to the public internet.
