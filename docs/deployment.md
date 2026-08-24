# Deployment

## Status

This submission ships **source + a fully working local run**, verified by an actual `npm run build` and E2E pass in this repository. No hosted live-demo URL is included, because a free hosting deploy that "just works" for this stack (Node/Express API + SQLite + a Vite SPA) needs at least one of:

- a persistent disk for the SQLite file (most zero-config free tiers use ephemeral filesystems), or
- a managed Postgres swap-in, which the schema supports but has not been provisioned/tested against here, or
- secrets (a hosting platform API token) that were not available in the build environment for this submission.

Rather than fake a deployment or claim a URL that wasn't actually verified, here is the exact remaining step for each realistic option.

## Option A — Render (recommended, simplest true zero-cost path)

1. Push this repo to GitHub (done — see main README).
2. On [render.com](https://render.com), **New → Web Service**, connect the repo, root directory `backend/`.
   - Build command: `npm install && npx prisma db push && npm run db:seed && npm run build`
   - Start command: `npm start`
   - Add a Render **Disk** mounted at `backend/` (or set `DATABASE_URL` to a path on the disk) so the SQLite file survives restarts — otherwise demo data resets on every deploy, which is actually acceptable for a judge demo but worth knowing.
   - Environment variables: copy from `.env.example`; leave Razorpay/Anthropic keys blank for DEMO mode, or fill in real TEST-mode keys.
3. Second Render **Static Site** (or Vercel/Netlify — see Option B) for `frontend/`, build command `npm install && npm run build`, publish directory `dist`, with an environment-specific rewrite of `/api` and `/webhooks` to the backend service's URL (Vite's dev-only proxy does not apply in production — add a small reverse-proxy rule or set `VITE_API_BASE` and update `frontend/src/lib/api.ts`'s `BASE` constant accordingly).

**This was not executed** in this submission — it requires a Render account/token this environment does not have. The steps above are the exact remaining action.

## Option B — Vercel/Netlify (frontend only) + Render/Fly.io (backend)

Same shape as Option A, split across two providers. Same blocker: no hosting credentials available here.

## Option C — Docker (self-hosted / judge's own machine)

A `docker-compose.yml` is not included in this submission (kept out to avoid adding untested infrastructure) — the two services run directly with `npm run dev` per the README, which is the verified, judge-reproducible path. Containerizing is straightforward future work: two stock Node 20-alpine images, backend exposing 4000, frontend served via a static file server or `vite preview` on 5173, with `DATABASE_URL` pointed at a mounted volume.

## What *is* verified

- `cd backend && npm install && npx prisma db push && npm run db:seed && npm run dev` — starts and serves real seeded data.
- `cd frontend && npm install && npm run build` — production build succeeds (see README build output).
- `cd tests && npm install && npx playwright test` — E2E suite passes against the local dev servers.

These are the commands a judge can run to see the real system, today, without any hosting step.
