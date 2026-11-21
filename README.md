# Job Search

A self-hosted, invite-only app that finds jobs daily, scores them against each user's job targets, and drafts tailored resumes and cover letters from a master profile. See [SPEC.md](SPEC.md) for what it does and [CLAUDE.md](CLAUDE.md) for how the code is organized.

## Local development

Needs Node 26 and Postgres 17.

```bash
createdb jobai_dev && createdb jobai_test
cd web
cp .env.example .env
npm install
npm run db:migrate
npm run dev          # web app on http://localhost:3000
npm run worker:dev   # background worker, in a second terminal
```

Signing in needs a Google OAuth client (Google Cloud console, "OAuth client ID", type "Web application") with the authorized redirect URI `http://localhost:3000/api/auth/callback/google`, plus one for the production address. Put its ID and secret in `web/.env`, and set `ADMIN_EMAIL` to your own Google address.

Checks: `npm run typecheck`, `npm run lint`, `npm test`.

After changing a table in `web/src/db/schema/`, run `npm run db:generate` and commit the new file in `web/drizzle/`.

## Deployment

Merges to `main` publish `ghcr.io/cjrussell23/job-ai-web`. On the server, copy `.env.example` to `.env`, fill it in, and run `docker compose up -d` (or deploy the same file as a Portainer stack). The web container applies migrations on start. Point a Cloudflare Tunnel route at `http://localhost:3000`.

The `backup` service writes a nightly encrypted database dump to `BACKUP_DIR`; see [docs/backups.md](docs/backups.md) for setup and restoring.
