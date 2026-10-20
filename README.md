# Wenjun Lee — terminal-style homepage

Personal homepage for Wenjun Lee (李文俊), a master's student at Nanjing University.
Adapted from Jiang Yanyan's terminal-style homepage template.

## Content

- `content/index.md`: homepage, contact information, and navigation.
- `content/bio.md`: English and Chinese biography and education.
- `content/research.md`: current research and broader interests.
- `content/help.md`: terminal commands and appearance help.

Edit the Markdown files; the compiler regenerates `src/generated/content.ts`.
The site is static, built with TypeScript, Vite, and xterm.js.

## Local use

- `npm ci`: install dependencies.
- `npm run dev`: start a local preview.
- `npm run build`: compile content and generate `dist/`.
- `npm run preview`: preview the production build.
- `npm run typecheck`: check TypeScript.
- `npm test`: run the existing test suite.

## Appearance

The original template layout, typography, light palette, and CRT effects are
preserved. Use `theme dark`, `theme light`, or `theme system` in the terminal.
The preference is stored locally. Switching appearance preserves terminal input
and scrollback. There is no added toolbar or theme menu.

## Deployment

GitHub account: https://github.com/leeewj
Public domain: wenjunlee.com

Hosting target is **Cloudflare Pages**, with DNS managed by Cloudflare.

The build output is `dist/`; the build is reproducible from source, so `dist/`
and `node_modules/` stay git-ignored. No `CNAME` file is used — the custom domain
is bound in the Cloudflare dashboard, not in the repo.

### Cloudflare Pages settings

- Framework preset: none (or Vite)
- Build command: `npm run build`
- Build output directory: `dist`
- Environment variable: `NODE_VERSION` = `22` (also pinned in `.node-version`;
  Vite 8 needs Node 20.19+ / 22.12+, so do not drop to 18)

### Deploy checklist

1. Push this repo to GitHub as `wenjunlee-homepage`.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo,
   using the settings above.
3. In the Pages project, add custom domains `wenjunlee.com` and
   `www.wenjunlee.com`.
4. In the Cloudflare zone, replace Spaceship's default records with the ones
   Pages asks for (usually a `CNAME` for `www` and either a `CNAME`/`A` or a
   flattened record for the apex).
5. At Spaceship, change the nameservers to the two Cloudflare nameservers shown
   for this zone.

Every later push to `main` redeploys automatically.

### Registrar notes

- The registrar stays Spaceship; only the nameservers move to Cloudflare.
- Add the custom domain in Pages *first*, then fix DNS — that way Cloudflare can
  auto-create the required records.
- If an existing record conflicts with the same hostname, delete it first.
- The old `gh-pages` based `npm run deploy` script is unused here; it is kept only
  as a fallback for a GitHub Pages deploy.

## Day-to-day editing

The loop is: edit locally → look at it locally → commit → push. Cloudflare builds
`main` on every push, so the push *is* the deploy.

```bash
npm run dev          # hot-reloading dev server; edit and watch it change
```

When it looks right:

```bash
./deploy.sh "what changed"   # typecheck + build + commit + push in one step
```

`deploy.sh` refuses to run if the local proxy (127.0.0.1:7890) is down, because
this machine cannot reach GitHub directly. It also stops on a type error or a
failed build, so broken code never reaches `main`.

Doing it by hand is the same steps:

```bash
npm run typecheck && npm run build
git add -A && git commit -m "what changed" && git push
```

### Where to change what

- `content/*.md` — page text. Every `.md` becomes a command and a `#hash` route;
  a new file needs no registration. `npm run build` regenerates
  `src/generated/content.ts` from these, and that generated file is committed.
- `src/` — terminal behaviour, theme, built-in commands (`src/apps/*.ts`, wired
  up in `src/apps/index.ts`).
- `public/` — `style.css`, fonts, favicon.

### Verifying a deploy

```bash
curl -s https://wenjunlee.com/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'  # asset hash
curl -o /dev/null -w '%{http_code}\n' https://wenjunlee.com/                 # 200
```

To roll back, use Workers & Pages → the project → Deployments → `⋯` → Rollback
(instant), or `git revert <sha> && git push` to keep the history honest.

### Notes

- Editing `content/*.md` straight on github.com also works — the build regenerates
  the manifest from the markdown. Editing `src/` on the web works too, but the
  Pages build does not run `tsc` or the tests, so a type error can ship silently.
  Prefer `./deploy.sh` locally for code changes.
- Do not add a `CNAME` file; the custom domain lives in the Cloudflare dashboard.
- Never lower `.node-version` below 22 (Vite 8 needs Node >= 20.19 / 22.12).
