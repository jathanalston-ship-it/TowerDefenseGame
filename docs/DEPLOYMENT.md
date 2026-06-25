# DEPLOYMENT.md — Deploying to Cloudflare Pages

Exact, step-by-step instructions to put this game online with **Cloudflare Pages**,
written for someone who has **never deployed a Cloudflare Pages app before**. No
prior Cloudflare experience assumed.

> **What you're deploying:** a 100% **static** single-page app (React + TypeScript +
> Vite). There is **no backend, no server, no database, and no environment
> variables**. Cloudflare just serves the files Vite builds, worldwide, for free on
> the Pages free tier. Game progress saves in the player's own browser
> (`localStorage`).

---

## 0. What you need first (prerequisites)

1. **A GitHub account** — https://github.com (free).
2. **A Cloudflare account** — https://dash.cloudflare.com/sign-up (free).
3. **This project pushed to a GitHub repository** (Section 1).
4. *(Optional, to test locally first)* **Node.js 20+** — https://nodejs.org. Then:
   ```bash
   npm install
   npm run dev      # play at http://localhost:5173
   npm run build    # produces the dist/ folder Cloudflare will serve
   ```

You do **not** need a credit card, a custom domain, or the Cloudflare CLI.

---

## 1. Get the code onto GitHub

Cloudflare Pages deploys *from a GitHub repository*. If your code is already on
GitHub, skip to Section 2.

If it is not on GitHub yet, from the project folder:

```bash
# one-time, if this folder isn't a git repo yet:
git init
git add -A
git commit -m "Initial commit"

# create an empty repo on github.com first (no README), then:
git remote add origin https://github.com/<your-username>/<your-repo>.git
git branch -M main
git push -u origin main
```

Confirm on github.com that you can see `package.json`, `index.html`, the `src/`
folder, and `package-lock.json` in the repo. **`package-lock.json` must be
committed** — Cloudflare uses it for reproducible installs. (`node_modules/` and
`dist/` are intentionally *not* committed; Cloudflare rebuilds them.)

---

## 2. Repository structure (what Cloudflare cares about)

You don't need to change anything — this is just what Pages looks for:

```
<repo root>/              ← "Root directory" in Cloudflare = this folder
├─ package.json           ← defines `npm run build`
├─ package-lock.json      ← reproducible installs (committed)
├─ index.html             ← Vite entry
├─ vite.config.ts         ← build config (outputs to dist/)
├─ .node-version          ← pins Node 20 for the build (already included)
├─ public/
│  ├─ _redirects          ← SPA routing fallback (already included)
│  └─ _headers            ← caching/security headers (already included)
└─ src/ …                 ← the app

After a build, Vite creates:
└─ dist/                  ← "Build output directory" in Cloudflare = this folder
   ├─ index.html
   ├─ _redirects          (copied from public/)
   ├─ _headers            (copied from public/)
   └─ assets/…            (hashed JS/CSS)
```

---

## 3. Create the Cloudflare Pages project

1. Go to the **Cloudflare dashboard**: https://dash.cloudflare.com
2. In the left sidebar, click **Workers & Pages**.
3. Click **Create application** → the **Pages** tab → **Connect to Git**.
4. **Authorize Cloudflare to access GitHub** when prompted. Choose **Only select
   repositories** and pick this repo (or "All repositories"), then **Install &
   Authorize**.
5. Back in Cloudflare, **select your repository** from the list and click **Begin
   setup**.

---

## 4. Configure the build (the important screen)

On the **Set up builds and deployments** screen, enter **exactly** this:

| Field | Value | Notes |
|---|---|---|
| **Project name** | e.g. `assimilate` | becomes `assimilate.pages.dev` |
| **Production branch** | `main` | (or whichever branch holds your code) |
| **Framework preset** | **Vite** | sets sensible defaults; if missing, choose **None** and fill the next two rows manually |
| **Build command** | `npm run build` | |
| **Build output directory** | `dist` | ⚠️ the single most common mistake — it must be `dist`, not `/` or `build` |
| **Root directory** | *(leave blank / `/`)* | only change if the app is in a subfolder |

**Environment variables:** **none required.** Leave that section empty. (See
Section 7 if you're curious.)

**Node version:** already pinned to **20** by the committed `.node-version` file —
you don't need to set anything. (If you ever want to override it, add an
environment variable `NODE_VERSION` = `20`.)

Click **Save and Deploy**.

---

## 5. Watch the first deploy

Cloudflare now runs, in order:

1. **Clone** your repo.
2. **Install** dependencies (`npm clean-install` from your lockfile).
3. **Build** (`npm run build` → type-checks, then writes `dist/`).
4. **Deploy** the contents of `dist/` to its global CDN.

You'll see a live build log. A successful run ends with **"Success: Deployment
complete"** and a URL like **`https://assimilate.pages.dev`**. Open it — the game
should load. 🎉

Builds typically take ~1–2 minutes.

---

## 6. How future updates deploy (automatic)

Once connected, Cloudflare Pages redeploys **automatically**:

- **Every push to your production branch** (`main`) → a new **production** deploy.
- **Every push to any other branch, and every Pull Request** → its own **preview**
  deploy at a unique URL (great for testing before merging).

You never have to manually upload anything again — just `git push`.

```bash
git add -A
git commit -m "tweak balance"
git push           # Cloudflare rebuilds and redeploys within ~1–2 min
```

---

## 7. Environment variables (you don't need any)

This app uses **zero** environment variables and makes **no** network requests — it
runs entirely in the browser. There is nothing to configure.

If a *future* feature ever needs a build-time value, note that only Vite variables
prefixed with **`VITE_`** are exposed to the browser (e.g. `VITE_API_URL`). Add them
under **Settings → Environment variables** in the Pages project. **Never** put
secrets (API keys, tokens) in a `VITE_`-prefixed variable or anywhere in a static
frontend — they ship to every visitor. This game needs none of that.

---

## 8. (Optional) Add a custom domain

1. In your Pages project → **Custom domains** → **Set up a custom domain**.
2. Enter your domain (e.g. `play.example.com`) and follow the prompts.
3. If the domain is already on Cloudflare, DNS is configured automatically. If not,
   add the shown **CNAME** record at your DNS provider.
4. HTTPS certificates are issued automatically.

> Tip: player saves (`localStorage`) are tied to the exact domain. Saves on
> `your-project.pages.dev` will **not** carry over to a custom domain — that's normal
> browser behavior, not a bug. Pick your final domain before sharing widely.

---

## 9. Cloudflare compatibility review (verdict)

A pass over each subsystem for Pages hosting:

| Area | Status | Notes |
|---|---|---|
| **Build process** | ✅ | `npm run build` (tsc + vite) → `dist/`. Node pinned via `.node-version`. Reproducible install from `package-lock.json`. |
| **Asset loading** | ✅ | Content-hashed assets under `/assets`, absolute base `/` (Pages serves from root). `_headers` sets `immutable` long-cache on them. |
| **Save system** | ✅ | `localStorage` only; access is wrapped in `typeof`-guards + try/catch with an in-memory fallback, so private-mode / disabled storage never crashes the app. |
| **Routing** | ✅ | Single page; `public/_redirects` (`/* /index.html 200`) covers any future client routes and direct-link refreshes. |
| **Environment variables** | ✅ | None used or required. No secrets in the bundle. |
| **Static asset management** | ✅ | All assets bundled by Vite or served from `public/`. No external CDNs/fonts (uses `system-ui`), no `process.env`, no `fetch`, no Node-only APIs in app code. |
| **SSR / server** | ✅ N/A | Pure client SPA — nothing to render server-side, nothing to keep running. |

**No blocking issues.** No corrections were required to make it deploy; the
`_headers`, `_redirects`, `.node-version`, and inline favicon are hardening/quality
improvements, all already committed.

---

## 10. Common issues & troubleshooting

**Build fails immediately / "could not determine how to build".**
Set **Framework preset = Vite** (or **None** with Build command `npm run build`).
Ensure **Root directory** points at the folder containing `package.json` (blank/`/`
for this repo).

**Build fails with a Node / "engine" / syntax error.**
The build Node version is too old. This repo pins Node 20 via `.node-version`. If it's
still wrong, add an environment variable **`NODE_VERSION` = `20`** (Settings →
Environment variables) and redeploy.

**Build fails: `npm ci` / lockfile out of sync.**
Make sure **`package-lock.json` is committed and up to date.** Run `npm install`
locally, commit the updated lockfile, and push.

**Build succeeds but the site is a blank white page.**
Almost always the **Build output directory** is wrong — it must be **`dist`**. Fix it
in **Settings → Builds & deployments**, then **Retry deployment**. Also open the
browser **DevTools → Console**; a red error there points to the cause.

**`404` / "Nothing is here yet" when you refresh a page or open a deep link.**
The SPA fallback isn't applying. Confirm `public/_redirects` exists and contains
`/*    /index.html    200`, and that it appears in `dist/` after a build. (It's
already in this repo.)

**Assets fail to load / "Failed to load module script" / MIME errors.**
Output directory is wrong (see blank-page above) or you set a custom Vite `base`.
This project uses the default `base: '/'`, which is correct for Pages. Don't change
it unless serving from a sub-path.

**My game progress disappeared.**
Saves live in the browser's `localStorage`, scoped to the exact domain. Expected
causes: you switched between a `*.pages.dev` preview URL and the production/custom
domain; you're in private/incognito mode; or you cleared site data. This is browser
behavior, not a deploy failure.

**I pushed a change but the site looks the same.**
Check the **Deployments** tab — did the new build succeed? Then hard-refresh
(Ctrl/Cmd-Shift-R). HTML is served with a short cache and assets are content-hashed,
so a successful deploy is picked up quickly; a stale tab just needs a refresh.

**Cloudflare can't see my repository.**
Re-run the GitHub authorization: Cloudflare dashboard → **Workers & Pages** →
**Settings** → **GitHub** (or the GitHub app at github.com → Settings → Applications
→ Cloudflare Pages) and grant access to the repo.

---

## 11. (Optional) Deploy from the command line instead

If you prefer not to connect GitHub, you can deploy the built folder directly with
Cloudflare's CLI, **Wrangler**:

```bash
npm install -g wrangler        # or: npx wrangler ...
npm run build                  # produce dist/
wrangler pages deploy dist     # follow the login prompt the first time
```

This uploads `dist/` straight to Pages. The GitHub method (Sections 3–6) is
recommended because it redeploys automatically on every push.

---

## 12. Rolling back a bad deploy

In the Pages project → **Deployments**, find a previous good deployment → **⋯** menu
→ **Rollback to this deployment**. Production instantly points back to it while you
fix forward.

---

### TL;DR

| Setting | Value |
|---|---|
| Connect | Workers & Pages → Create → Pages → Connect to Git |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(blank / repo root)* |
| Environment variables | none |
| Node version | 20 (pinned via `.node-version`) |

Push to `main` → Cloudflare builds and deploys automatically.
