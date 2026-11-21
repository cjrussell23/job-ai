# Job Search App

A self-hosted, invite-only web app that finds jobs daily, scores them against each user's targets, and drafts tailored cover letters and resumes from a master profile. Full product and technical spec: [SPEC.md](./SPEC.md). Read it before making design decisions. Use the terms in [CONTEXT.md](./CONTEXT.md) exactly, in code and in conversation. Lasting decisions are recorded in [docs/adr/](./docs/adr/).

## Stack

- **Web app:** Next.js (App Router, TypeScript) with the Vercel AI SDK for all model calls.
- **Database:** Postgres. Also backs the job queue and the daily schedule.
- **Scraper:** a small Python service wrapping JobSpy, called by the web app over the internal Docker network.
- **PDF rendering:** Playwright, from HTML templates.
- **Deployment:** Docker Compose on a home server, reached through the existing Cloudflare Tunnel. No open router ports.
- **Sign-in:** Google account only, for addresses the admin has invited. No passwords, no magic links, no email service.

## Rules that must hold

1. **No invented facts.** The master profile is the only source of facts for resumes and cover letters. The AI may select, reorder and rephrase profile items, never add to them. Every generated line records the profile items it came from. The one permitted guess is a pay estimate for a job, which is always labelled, carries a certainty, and never counts as stated pay (ADR 0002).
2. **Ask, don't assume.** When something seems missing from a profile, create a profile question. A recorded "no" is passed to the model as something not to claim.
3. **Suggestions are accept-or-reject edits** against a specific profile item, never silent rewrites.
4. **Every match has two scores, target fit and profile fit, each with a readable reason, and the user sees both.** A field a posting does not state is "unknown", never a fail; each firm limit has a user setting for whether unknowns are shown (the default) or hidden.
5. **Firm limits run before any model call.** A job is scored once per user and target. Saving a change never triggers scoring; existing live matches are rescored only when the user asks, within the admin's limit.
6. **Nothing is sent to an employer without the user's action.** Tailored resumes and cover letters are drafts until the user approves them, and an application can only use approved documents. Auto-apply is a future add-on, not part of the current build.
7. **Never store users' job-site logins.**
8. **Every job source sits behind one common interface**, so a broken source can be swapped without touching the rest of the app. Log each scrape run per source.
9. **Jobs, postings and watched companies are shared across users; everything else is scoped to one user.** Every query on user-owned data filters by user. The admin dashboard never exposes a member's profile, documents or applications.
10. **A job is not a posting.** A job is identified by company, title and location; each advertisement of it is a posting. Matches and applications attach to the job (ADR 0001).
11. **A match is not an application.** An application exists only once the user saves or applies.
12. **App-wide settings are data, not code.** Models, spend caps, the rescore limit, source switches and the run schedule are set in the admin dashboard. Secrets still live in environment variables.

## Design for later, now

- Record each job's application system (Greenhouse, Lever, Workday, and so on) at discovery.
- Give each application a submission method and an approval state from the start, even though the only method for now is manual.

## Build order

Work through the phases in SPEC.md in order. Phases 1 and 2 (foundation, then the daily feed) come first and should produce a usable daily scored job list before anything else is started. Do not start a later phase until the current one runs end to end.

## Decisions

The questions left open in the first draft are settled; SPEC.md ends with the list. If something comes up that the spec does not answer, ask before assuming.

## Conventions

- TypeScript strict mode. Validate all model output against a schema before saving it.
- Database changes go through migrations, never ad hoc.
- Secrets live in environment variables; commit a `.env.example`, never a `.env`.
- Prefer Canadian job sources and settings where a choice exists (the first users are in and around Calgary).

## Agent skills

### Issue tracker

Issues and specs live in this repo's GitHub Issues, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
