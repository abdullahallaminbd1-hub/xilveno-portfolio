# Xilveno Portfolio

Cloudflare-native rebuild of the approved Abdullah portfolio reference.

The WordPress theme at `F:\Desktop\Portfolio website\abdullah-portfolio\` is a read-only visual/content reference. This repository does not load WordPress, PHP, Elementor, MySQL, or WordPress plugins at runtime.

## Architecture

- TypeScript Cloudflare Worker in `src/index.ts`.
- Server-rendered semantic HTML using the approved reference class structure.
- Approved reference CSS copied to `src/public/assets/css/`.
- Workers Static Assets from `src/public/`.
- D1 binding `DB`, database name `xilveno-portfolio-db`.
- R2 binding `MEDIA`, bucket name `xilveno-portfolio-media`.
- Custom admin application under `/admin/`.
- Editable public content stored in D1.

## Routes

Public: `/`, `/work/`, `/work/{project-slug}/`, `/about/`, `/services/`, `/process/`, `/faq/`, `/contact/`, `/search?q=...`, `/404`, `/robots.txt`, and `/sitemap.xml`.

Admin: `/admin/login`, `/admin/dashboard`, `/admin/home`, `/admin/about`, `/admin/services`, `/admin/projects`, `/admin/projects/new`, `/admin/faq`, `/admin/media`, `/admin/settings`, `/admin/forms`, and `/admin/demos`.

## Local development

Requirements: Node.js 24 or compatible current LTS, npm, and Wrangler 4.

```powershell
cd "F:\Desktop\Portfolio website\xilveno-portfolio"
npm install
Copy-Item .dev.vars.example .dev.vars
$env:CI="1"
npm run db:migrate:local
npm run dev
```

Wrangler prints the local URL, normally `http://localhost:8787`.

Quality checks:

```powershell
npm run typecheck
npx wrangler deploy --dry-run
```

The local browser round-trip check exercises each homepage/About editor field against the public page, verifies About portrait upload/select/replace/remove, and restores the original content. Set `QA_PASSWORD` to the local admin password, then run:

```powershell
node scripts/qa-admin-public-content.mjs --url=http://127.0.0.1:8790
```

Production Admin browser checks use real Chrome, verify the homepage/About fields and image lifecycle, and exercise reversible Service, FAQ, Settings, project-image, and Media alt-text edits. These checks temporarily update public content and create a project with test images; the script restores or deletes its test data. Use a protected local password file and do not pass the production password as a command-line argument:

```powershell
$env:QA_PASSWORD_FILE = 'C:\secure\production-admin-password.txt'
node scripts/qa-admin-public-content.mjs --url=https://xilveno.shop --channel=chrome
node scripts/qa-admin-production-roundtrip.mjs --url=https://xilveno.shop --channel=chrome
node scripts/qa-admin-responsive.mjs --url=https://xilveno.shop --channel=chrome --out='C:\temp\xilveno-responsive'
Remove-Item Env:QA_PASSWORD_FILE
```

`.dev.vars` is ignored by Git. Replace its local bootstrap password before using the admin. Never copy local secrets to GitHub or production source.

## D1 setup

After Cloudflare account authorization:

```powershell
npx wrangler d1 create xilveno-portfolio-db
```

Copy the returned database ID into `wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`, then run:

```powershell
$env:CI="1"
npm run db:migrate:remote
```

The migration creates and seeds the approved content, project, media, inquiry, session, demo, and audit tables. Do not use local D1 data as the production backup.

## R2 setup

After Cloudflare account authorization:

```powershell
npx wrangler r2 bucket create xilveno-portfolio-media
```

Authenticated admin upload flow:

1. Validate file size, MIME type, and signature.
2. Write the object to R2 under `media/{random-id}-{filename}`.
3. Store filename, MIME type, size, alt text, key, and ETag in D1.
4. Serve through `/media/{object-key}`.
5. Delete both the R2 object and D1 metadata when requested.

The current upload limit is 8 MB. Supported types are JPEG, PNG, WebP, and SVG with a basic signature check.

## Admin security

- PBKDF2-SHA-256 password hashing via Web Crypto with a random salt.
- Random session token; only its SHA-256 representation is stored in D1.
- HttpOnly, SameSite=Lax session cookie; Secure on HTTPS.
- Four-hour session expiry.
- CSRF token required for admin mutations.
- D1-backed login rate limiting.
- Inquiry CSRF, honeypot, minimum fill-time, validation, and rate limiting.
- Inquiry IP data stored as a SHA-256 hash.
- Admin JSON responses use `no-store`.
- Secrets belong in Worker secrets or local `.dev.vars`, never in Git.

Create production secrets with Wrangler:

```powershell
npx wrangler secret put ADMIN_BOOTSTRAP_PASSWORD
npx wrangler secret put SESSION_SECRET
```

The first request with `ADMIN_BOOTSTRAP_PASSWORD` creates `admin@xilveno.shop`. Email delivery is not faked; without an email provider, inquiries remain in D1 and `/admin/forms` is the source of truth.

## Editable content

The D1 model covers homepage hero/panel/technology strip/headings/CTA/about blocks, the About portrait setting, services and details, skills, process steps, FAQs, projects, categories, settings, SEO, inquiries, demo records, and media metadata. Image pickers are connected only to slots rendered by the public site: the About portrait uses `about_image_media_id` and falls back to the public placeholder when cleared; project card, case-study lead, and gallery images render from their project media records. Public server-rendered pages are not cached, so saved D1/R2 content appears on the next page load. The visual system remains code-based; admin changes content, not arbitrary CSS/layout.

## Demo subdomains

Demo records support values such as `dental.xilveno.shop`, `medspa.xilveno.shop`, and `auto.xilveno.shop`. Demo sites should be independent Workers/repositories so they cannot break the main portfolio Worker. Cloudflare API-token automation is intentionally disabled until a narrowly scoped account token is authorized.

## Deployment

1. Create the new GitHub repository `xilveno-portfolio`.
2. Push this project to `main`.
3. Connect it to Cloudflare Workers Builds.
4. Configure the D1/R2 resources and production secrets.
5. Apply the remote D1 migration.
6. Deploy and complete browser/security/SEO verification.
7. Attach `xilveno.shop` and `www.xilveno.shop` through Cloudflare Custom Domains without changing unrelated DNS records.

No GitHub or Cloudflare OAuth, account, repository, API-token, DNS, or custom-domain authorization is assumed by this local repository. Those steps require explicit account access.

## Backup and recovery

Keep migrations in Git, export approved content before major edits, use D1 backup/Time Travel features where available, and back up R2 separately from D1. Never commit inquiry exports or private data. There is no automatic destructive cleanup.

## Visual regression baseline

The approved baseline is the existing WordPress implementation. Compare the new site at 1440x900, 768x1024, and 390x844 for header, hero, buttons, stack, services, projects, process, FAQ, CTA, footer, navigation drawer, forms, and project pages. Local type/config/runtime checks are not a substitute for authorized live browser verification.

## Authorization boundaries

Stop and request authorization for OAuth approval, repository/account access, API-token creation, D1/R2 resource creation, Workers Builds connection, or custom-domain/DNS changes. Do not replace those steps with guessed IDs, fake deployments, fake domain verification, or committed credentials.
