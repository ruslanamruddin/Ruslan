# Research Archive (Astro + MDX)

Personal "arXiv 2.0"-style research archive: metadata-first, split-view browsing, static deploy, and content authored from markdown/MDX.

## Stack

- Astro 5
- Astro Content Collections (`src/content/config.ts`)
- MDX (`@astrojs/mdx`)
- Static output for GitHub Pages

## File tree overview

```text
.
├── .github/workflows/deploy.yml
├── astro.config.mjs
├── public/
│   ├── cv/ruslan-cv.pdf
│   └── images/
├── src/
│   ├── components/
│   │   ├── CommandPalette.astro
│   │   ├── FiltersBar.astro
│   │   ├── ProjectList.astro
│   │   ├── ProjectPreviewPanel.astro
│   │   ├── StatusBadge.astro
│   │   └── TagChip.astro
│   ├── content/
│   │   ├── config.ts
│   │   ├── projects/*.mdx
│   │   └── templates/project-template.mdx
│   ├── layouts/BaseLayout.astro
│   ├── lib/
│   │   ├── constants.ts
│   │   ├── paths.ts
│   │   └── projects.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── projects/index.astro
│   │   ├── projects/[slug].astro
│   │   ├── cv/index.astro
│   │   └── notes/index.astro
│   └── styles/global.css
├── package.json
└── tsconfig.json
```

## Local development

```bash
npm install
npm run dev
```

Recommended Node.js version: `22.x` (matches the GitHub Actions deploy workflow).

Build locally:

```bash
npm run build
npm run preview
```

## Add a new project

1. Copy `src/content/templates/project-template.mdx`.
2. Save it as `src/content/projects/your-project-slug.mdx`.
3. Fill in frontmatter fields:
- `title`
- `slug`
- `date`
- `last_updated`
- `type` (`Research | Tool | Prototype`)
- `status` (`Ongoing | Results ready (writing) | Preparing submission | Under review | Published`)
- `tags`
- `summary`
- `abstract`
- `featured_image` (optional path under `public/`)
- `links` (`github/demo/poster/slides/dataset`, optional)
- `venue_target` (optional)
- `updates` (`[{ date, note }]`)
4. Write body sections (recommended): `Methods`, `Results / Progress`, `Limitations`, `Next steps`.
5. Save. The archive and detail page are generated automatically.

## Theme customization

- Global theme tokens: `src/styles/global.css` (`:root` and `:root[data-theme="dark"]`).
- Accent color: `--accent` and `--accent-soft`.
- Typography: `--font-body`, `--font-ui`, `--font-mono`.
- Surface/borders: `--bg`, `--surface`, `--border`.

## GitHub Pages deployment (exact steps)

1. Push this repo to GitHub (branch `main`).
2. Confirm workflow file exists at `.github/workflows/deploy.yml`.
3. In GitHub repo settings, open **Pages**.
4. Under **Build and deployment**, choose **Source: GitHub Actions**.
5. Push to `main` (or run workflow manually via **Actions** tab).
6. Wait for `Deploy to GitHub Pages` workflow to finish.
7. Your site will be available at:
- `https://<your-username>.github.io/<your-repo>/`

Notes:
- `astro.config.mjs` auto-detects GitHub Actions and sets `base`/`site` so nested repo URLs work correctly.
- No backend required; everything is static.
