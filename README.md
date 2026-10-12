# CSITAN Happy Dashain — Collaborative Signature Poster

Members draw a signature on `/`. An admin approves it. Approved signatures appear around the Happy Dashain poster on `/poster`.

| Route | What it is |
|---|---|
| `/` | Signature canvas only (draw, Undo, Clear, Submit) |
| `/poster` | The poster with approved signatures |
| `/admin` | Moderation: approve / reject (needs `ADMIN_TOKEN`) |

Stack: Next.js 16 (App Router) · TypeScript (strict) · Tailwind 4 · PostgreSQL + Prisma 7 · Zod · Vitest · Playwright.

## Setup

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env.local       # then edit if needed (see below)

# 1. Database — pick ONE
docker compose up -d db          # Docker (Postgres 17 on localhost:5544)
npm run db:local:start           # no Docker: private cluster in ./.pgdata (needs Postgres server binaries)

# 2. Create the tables
npm run db:deploy                # applies prisma/migrations (use `npm run db:migrate` while changing the schema)

npm run dev                      # http://localhost:3000
```

Both database options use `postgresql://csitan:csitan@localhost:5544/csitan_dashain`, plus `csitan_test` (integration tests) and `csitan_e2e` (browser tests).

### Environment (`.env.local`, never committed)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) |
| `STORAGE_DRIVER` / `STORAGE_DIR` | Where PNGs are stored (`local` → `./storage`) |
| `AUTO_APPROVE_SIGNATURES` | `true` (default) = live immediately, `false` = needs admin approval |
| `ADMIN_TOKEN` | Secret for moderation (≥ 8 chars). Unset = nobody can moderate |
| `SUBMIT_RATE_LIMIT_MAX` | Submissions per IP per minute (default 5) |
| `ALLOW_LOCAL_STORAGE_IN_PRODUCTION` | Safety latch, see below |

### Database & migrations

- Schema: [prisma/schema.prisma](prisma/schema.prisma) (model `Signature`, enum `SignatureStatus`). Connection URL: [prisma.config.ts](prisma.config.ts).
- Change the schema → `npm run db:migrate -- --name what_changed` creates and applies a new SQL migration in `prisma/migrations/` (commit it).
- Deploy / CI / another machine → `npm run db:deploy` (applies pending migrations, never prompts, never resets).
- Inspect data → `npm run db:studio`.

## Storage — read this before deploying

PNG bytes are **not** in the database. PostgreSQL stores only the storage key and metadata; the file lives behind the `StorageAdapter` interface ([src/lib/storage](src/lib/storage)).

**Only a local-disk adapter exists.** It is fine for development and for one server with a persistent disk. It is **not** durable on serverless/ephemeral hosts (Vercel, most container platforms) and is not shared between servers. **No production object storage (S3/R2) is configured or implemented yet.** In production the app refuses to start with local storage unless you set `ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true`, so this can't be missed. Adding S3/R2 means writing one class that implements `StorageAdapter`.

## Moderation (approval workflow)

`AUTO_APPROVE_SIGNATURES` decides where a new signature starts:

- `true` (default): it is `APPROVED` immediately and appears on the poster. Admins can still **reject** anything afterwards.
- `false`: it starts `PENDING` and stays hidden until an admin approves it.

Either way the server validates every image first. Note that with auto-approve on, anyone who can reach `/` can put an image on the poster, so keep an eye on `/admin` (or switch to `false` for a public event).

- UI: open `/admin`, enter `ADMIN_TOKEN`, click Load, then Approve/Reject (previews work for pending images).
- API: `PATCH /api/signatures/:id` with header `x-admin-token` and body `{"status":"APPROVED"}`; queue: `GET /api/admin?status=PENDING`.
- This is a single shared token, not user accounts. Real authentication is a later milestone.

## API

- `POST /api/signatures` — multipart field `signature` (PNG). `201 {id, status:"APPROVED"|"PENDING"}`, `400` invalid image, `413` too large, `429` rate limited, `500` storage/database failure.
- `GET /api/signatures?page=1&limit=50` — APPROVED only, oldest first. `limit` 1–100. Returns `{items:[{id,width,height,createdAt}], page, limit, total, hasMore}`.
- `GET /api/signatures/:id` — the PNG (approved only; admins can preview others).

Server-side checks: ≤ 300 KB, real PNG, RGBA with alpha, 16–1600 × 16–800 px, fully decodable, not blank.

## Tests

```bash
npm run typecheck
npm run lint
npm test                 # unit tests (no database)
npm run test:integration # real PostgreSQL (csitan_test) + temp storage; needs the database running
npm run test:e2e         # real Chromium + real database (csitan_e2e); needs the database running
npm run test:all         # everything
```

Dev-only layout tools: `/poster?fixtures=60` (fake signatures, clearly bannered) and `&debug=1` (regions and bounding boxes). Ignored in production.
