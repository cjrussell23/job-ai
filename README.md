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

Merges to `main` publish `ghcr.io/cjrussell23/job-ai-web` and `ghcr.io/cjrussell23/job-ai-backup`. They are private, so the server logs in once with a GitHub token that can read packages (`docker login ghcr.io -u cjrussell23`).

On the server the stack lives in `~/job-ai` with `docker-compose.yml` and a filled-in `.env` (from `.env.example`):

```bash
cd ~/job-ai && docker compose pull && docker compose up -d
```

The web container applies migrations on start. It publishes no port: it joins the `cloudflared` container's Docker network (`TUNNEL_NETWORK`), and the tunnel's public hostname `jobs.chjrussell.com` points at `http://job-ai-web:3000`.

The `backup` service writes a nightly encrypted database dump to `BACKUP_DIR`; see [docs/backups.md](docs/backups.md) for setup and restoring.
