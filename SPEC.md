# Job Search App: Product and Technical Spec

As of 2026-11-21. Terms in this document are defined in [CONTEXT.md](./CONTEXT.md). Decisions with lasting consequences are recorded in [docs/adr/](./docs/adr/).

## Overview

A self-hosted, invite-only web app that finds jobs daily, scores them against each user's job targets, and drafts tailored resumes and cover letters from a master profile. It runs on a home server for a handful of users in and around Calgary and is managed by one admin.

**Goals**

- Find relevant jobs every day and notify each user about new matches.
- Score every job against the user's own targets and explain the score.
- Tailor cover letters and resumes using only facts the user has provided.
- Track every application from saved to outcome on one board.
- Help users improve their profile through suggestions and questions.

**Not in the first version**

- Auto-apply. It is planned as an add-on once the rest is built.
- Public sign-up, billing, or anything commercial.
- Storing users' job-site logins.
- Email of any kind. Sign-in and notifications are designed so that no email service is needed.

## Core concepts

| Concept | What it is | Why it matters |
| --- | --- | --- |
| Master profile | Everything a user could put in an application: roles, bullets, projects, skills, certifications, stories and free-form notes. | The only source of facts for tailoring. |
| Job target | A saved description of a job the user wants. Users keep several. | Drives both the daily search and target fit. |
| Job and posting | A job is one role at one company in one location. A posting is one advertisement of it on one source. | Stops the same role being shown and scored several times. See ADR 0001. |
| Match | The app's assessment of one job against one of a user's job targets. | The daily feed is a list of matches. |
| Resume | Either a standing resume the user built, or a tailored resume the AI proposed for one job. | The best profile items are chosen for each job. |
| Application | A user's pursuit of one job. Exists only once the user saves or applies. | Powers the tracking board and, later, auto-apply. |

**Master profile details**

- An uploaded resume is parsed into profile items once, then corrected by the user.
- Each item has a visibility setting: always include, never include, or cover letter only.
- Free-form notes can be added without formatting, to keep entry low effort.

**Job target details**

- Fields: role type, search titles, locations, remote, minimum pay, plus a free-text note.
- Each field is marked as a firm limit or a preference.
- Each firm limit has its own setting for unknowns: when a posting does not state the field, show the job (the default) or hide it. A job shown this way is flagged as unknown.
- **Search titles.** When the role type is set or changed, the AI proposes a list of job titles to search for. The user edits and approves the list, and only approved titles are searched.
- **Pay.** Each target states its minimum on a pay basis the user chooses, hourly or annual, along with the desired hours per week. Hourly and annual figures are compared using the desired hours (40 a week when not set), and a converted figure is always shown as converted. Where a posting states hours per week, that is shown beside it.
- The free-text note captures trade-offs, such as accepting lower pay for a strong growth path.
- Targets can be edited, paused or added at any time.

## Features

### Job discovery

- A daily scheduled run searches the approved search titles of every active target for every user.
- Searches run slightly wider than each target, so the app can report what loosening a limit would add.
- Every source sits behind one common interface, so a broken one can be swapped out. Each run is logged per source.

**Sources**

| Source | Access | Status |
| --- | --- | --- |
| Indeed Canada | JobSpy | Phase 2 |
| LinkedIn | JobSpy, at low volume, with one extra request per job for the description | Phase 2 |
| Job Bank | Public feed per search | Phase 2 |
| Government of Alberta | Site map plus posting pages (the RSS path is disallowed by the site's robots.txt) | Phase 2 |
| Greenhouse, Lever, Ashby | Public per-company feeds for watched companies | Phase 2 |
| Alberta Health Services and Recovery Alberta | HTML scraping; one scraper serves both | Coming soon, first in line |
| GC Jobs (federal) | Headless browser | Coming soon |
| City of Calgary | Headless browser | Coming soon |
| Workday career sites | Undocumented public endpoint, not yet verified | Coming soon |
| Google Jobs | Not currently fetchable through JobSpy | Dropped for now |

Sources marked coming soon are listed to users with that label.

**Watched companies**

- Greenhouse, Lever and Ashby feeds are per company, so the app keeps one shared list of watched companies.
- Any member can add a company. A company is also added automatically when a posting from another source links to its Greenhouse, Lever or Ashby page.

**Jobs and postings**

- A job is identified by normalized company, title and location. Each source's advertisement is a posting attached to it.
- A job shows the links to all its postings. The employer's career-page posting is the preferred apply link.
- A user can mark postings as not duplicates. This splits the job for every user and is logged with who did it.
- Each job records its application system, ready for auto-apply later.

**Job lifecycle**

- Every posting records when it was last seen on its source.
- A posting not found on a run is marked missing straight away, and users see its last-seen date.
- A job whose postings have all been missing for three consecutive runs is closed. Closed jobs leave the feed but stay, with their description, on any application that references them.

**Pay estimates**

- When no posting states pay, the app estimates a range with a certainty of low, medium or high, labelled as an estimate everywhere it appears.
- An estimate is made once per job and shared across users.
- An estimate never counts against a firm limit. See ADR 0002.

### Job scoring

- Firm limits filter jobs out before any AI call. An unknown field follows that limit's setting for unknowns.
- A match is created per user, job and target. When a job matches several of a user's targets, the feed shows the best match and names the others.
- Every match has two scores, each with a one-line reason, and the user sees both:
  - **Target fit:** how well the job suits the job target, including its preferences, its note, the user's learned preferences and any pay estimate.
  - **Profile fit:** how well the master profile suits the job.
- The two combine into one number for sorting and for the notification threshold. The default weighting is 60% target fit and 40% profile fit, adjustable by each user.

**Rescoring**

- A job is scored once per user and target. New jobs always use the latest profile, target and learned preferences.
- Saving a change never triggers scoring. When the profile, a target, or the learned preferences have changed since the last scoring, a "Rescore my jobs" button appears.
- A rescore covers live matches only: the job is not closed, the user has not dismissed it, and there is no application yet. It re-runs only the affected score.
- Editing a firm limit re-filters the feed immediately, since no model call is involved.
- The admin sets how often a member can rescore. The default is once a day.

### Feedback on suggestions

- Users grade each match with a thumbs up or down and a quick reason: pay, wrong role, too senior, location, company or other.
- Saving, applying and dismissing also count as signals.
- Recent graded examples are included in the scoring prompt.
- Feedback is summarized into a short list of learned preferences that the user can see and edit.
- Feedback shapes jobs scored from then on. It reaches existing matches only through a rescore.
- Repeated feedback can prompt a target change, such as turning a recurring rejection reason into a firm limit.

### Market suggestions

- When a target returns few jobs, the app shows real counts for loosening each limit.
- The AI suggests related search titles from the profile that the user is not yet searching for.
- Skills that appear in many matched jobs but not in the profile are flagged as worth learning.

### Resumes and cover letters

- A **standing resume** is built by the user in the resume builder or carried over from earlier applications. It is a selection of profile items plus a template.
- A **tailored resume** is proposed by the AI for one job: the most relevant profile items within a length budget, with suggested rewordings. Every line records the profile items it came from. Tailoring never changes the profile item itself.
- Cover letters draw from the same profile, including items marked cover letter only, and record their sources the same way.
- Users can edit, regenerate or request feedback on any draft. A line the user types that has no profile item behind it is allowed, is marked as user-written, and the app offers to save it as a profile item.
- **Approval.** Tailored resumes and cover letters start as drafts and must be reviewed and approved by the user. Editing an approved document returns it to draft. Standing resumes count as approved. An application can only use approved documents, and nothing reaches an employer otherwise.
- Output is a PDF rendered from an HTML template.

### Profile and resume suggestions

- General suggestions cover vague bullets, missing numbers, length, ordering and repetition.
- Job-specific suggestions cover gaps between a resume and a posting, including relevant profile items left off.
- Each suggestion is an accept-or-reject edit against a specific item.

### Profile questions

- The app asks about experience it cannot find, one skippable question at a time.
- Triggers are requirements that recur in matched jobs, thin profile items, commonly forgotten categories, and a specific job the user is keen on.
- A yes is followed by a request for one concrete example, which is saved as a profile item.
- A no is remembered, so the question is never repeated and the AI does not stretch toward it.
- Questions use neutral wording, such as asking whether the user has done something.

### Tracking board

- A board shows every application by status: saved, applied, interviewing, offer, rejected, withdrawn.
- Matches the user has not acted on are not applications and do not appear on the board; they live in the feed.
- Status is changed by hand in the first version.
- Each card links the job, its postings, both scores, and the cover letter and resume used.
- Later option: scan the user's inbox for replies and propose status changes, with manual override.

### Notifications

- After each daily run, users get a summary of new matches above their score threshold.
- The first channel is Discord, as direct messages from a bot. ntfy is the second.
- A couple of profile questions can ride along with the summary.

### Resume builder

- A form-based editor over the master profile, starting with one clean template.
- Users can save standing resumes and export them as PDF.
- More templates are added only once the rest is stable.

### Admin dashboard

App-wide settings live here so they can change without a code change.

- **Members:** add a Google address to invite, suspend, remove, set a spend cap.
- **AI:** the model used for each task, the default monthly cap, and usage per member. The API key itself stays in an environment variable.
- **Scoring:** how often members can rescore.
- **Sources:** turn each on or off, the watched company list, the run schedule.
- **Health:** the scrape run log with failures per source, and backup status.

The admin cannot read members' profiles, documents or applications from the dashboard.

### Account and data

- A member can download all their data.
- A member can delete their own account, which removes everything scoped to them straight away. Shared jobs, postings and watched companies stay.
- Both exist from phase 1.

### Auto-apply (future add-on)

- Built with Playwright, reusing per-platform form handling from Autoply where its licence allows.
- Each application carries a submission method and an approval state from day one.
- Default behaviour is to prepare the form and wait for approval, with opt-in automatic sending.
- It likely runs on each user's own machine, so job-site logins never reach the server.

## Architecture and hosting

Everything runs as Docker Compose services on the home server, reached through the existing Cloudflare Tunnel. The web app is the hub: it is the only service that talks to the database, the AI models and the notification channels.

```
Users (browser) --> Cloudflare Tunnel --> Web app --> AI models (Vercel AI SDK)
                                            |  |  \
                                  Scraper <-+  |   +--> PDF renderer
                                     |         v   \
                                     v      Postgres +--> Notifications
                                Job sources
```

| Service | Technology | Responsibility |
| --- | --- | --- |
| Web app | Next.js with the Vercel AI SDK | Interface, sign-in, profile, board, admin dashboard and all AI calls |
| Database | Postgres | All application data |
| Scheduler and queue | Postgres-backed job queue | Daily run, per-user scoring jobs, retries |
| Scraper | Python service wrapping JobSpy | Job board searches, called by the web app over the internal network |
| PDF renderer | Playwright | Resumes and cover letters from HTML templates |
| Backups | Nightly encrypted database dump | Written to a second drive on the same server |

The server has about 27 GiB of free memory, which is ample for Playwright.

**Access**

- The app is one more route on the existing Cloudflare Tunnel. No router ports are opened.
- Sign-in is by Google account only. The admin adds a member's Google address in the dashboard, and that is the invite. There are no magic links and no passwords.

**AI**

- All model calls go through the Vercel AI SDK from the web app.
- One shared API key, paid for by the admin. This may change later, so the arrangement is a setting, not an assumption built into the code.
- Claude Haiku 5.5 handles scoring, pay estimates and resume parsing; Claude Sonnet 5.5 handles writing. Both are chosen in the admin dashboard.
- Scoring uses structured output, so results are validated before they are saved.

**External libraries**

| Need | Choice | Note |
| --- | --- | --- |
| Job board search | JobSpy | Python, so it runs in its own container |
| Company career pages | Direct calls to Greenhouse, Lever and Ashby feeds | No library needed |
| Resume structure | JSON Resume schema | Starting point for profile items |
| Resume parsing | PDF and Word text extraction, then an AI pass | Parsed once per upload |
| PDF output | Playwright | Reused later for auto-apply and for sources that need a browser |
| Auto-apply | Playwright, with Autoply as a reference | Future add-on |

## Data model

Jobs, postings and watched companies are shared across users; everything else belongs to one user.

| Table | Key fields | Notes |
| --- | --- | --- |
| users | Google email, name, role, state, Discord id, score threshold, target-fit weight, spend cap | Role is admin or member. State is active or suspended. |
| app_settings | key, value | Models per task, default cap, rescore limit, run schedule, source switches |
| profile_items | user, type, parent item, content, dates, tags, visibility, source | Type covers role, bullet, project, skill, certification, story and note. Source is upload, manual, question or tailored document. |
| job_targets | user, role type, search titles, locations, remote flag, minimum pay, pay basis, desired hours, firm-or-preference flag per field, unknown handling per firm limit, note, active | Several per user |
| jobs | company, title, location, remote flag, pay range with period, hours per week, description, application system, pay estimate with certainty, state, first seen | Identity is normalized company, title and location. State is open or closed. |
| postings | job, source, link, posted date, last seen, consecutive missing runs | Unique by link |
| job_splits | postings split, user, date | Log of not-duplicate decisions |
| watched_companies | company, application system, feed identifier, origin, added by | Origin is member or discovered |
| job_matches | user, job, target, firm-limit result with unknown flags, target fit and reason, profile fit and reason, scored date, dismissed | One per user, job and target |
| feedback | job match, grade, reason, comment | Also records save, apply and dismiss actions |
| learned_preferences | user, statement, origin, active | Editable by the user |
| resumes | user, name, kind, job, template, state | Kind is standing or tailored. State is draft or approved. |
| resume_lines | resume, position, text, profile items used, origin | Origin is profile item, reworded or user-written |
| cover_letters | user, job, content, profile items used, version, state | State is draft or approved |
| applications | user, job, status, resume used, cover letter, submission method, approval state, status dates | Created when the user saves or applies. Submission method starts as manual only. |
| suggestions | user, profile item, kind, proposed text, state | State is open, accepted or rejected |
| profile_questions | user, topic, trigger, question, answer, state | A no is kept so the question is not repeated |
| ai_usage | user, month, task, model, cost | Backs the spend cap and the admin usage view |
| scrape_runs | date, source, target, counts, errors | For spotting broken sources |

## AI rules

The AI may select, reorder and rephrase what a user has written. It may never add facts about a user.

**Honesty**

- The master profile is the only source of facts for resumes and cover letters.
- Every generated line records which profile items it came from.
- When something seems missing, the app asks the user a question. It does not assume.
- A recorded no is passed to the model as something not to claim.
- A pay estimate is the one thing the app guesses, and it is always labelled, always carries a certainty, and never counts as stated pay.

**Control**

- Suggestions are always accept-or-reject edits, never silent rewrites.
- Both scores come with a reason the user can read.
- Learned preferences are visible and editable.
- A tailored resume or cover letter must be approved by the user before it can be used.
- Nothing is sent to an employer without the user's action.

**Cost**

- Firm limits run before any model call.
- A job is scored once per user and target; rescoring happens only when the user asks, within the admin's limit.
- Only jobs above a score threshold get a cover letter draft, and only when the user asks or opts in.
- A monthly spend cap per member, $10 by default and adjustable per member, with usage visible to the admin. At the cap, daily scoring continues and document drafting pauses until the next month, so the feed never goes dark.

## Build phases

Phases 1 and 2 deliver a working daily job feed; each later phase adds one capability on top.

| Phase | Scope | Usable result |
| --- | --- | --- |
| 1. Foundation | Docker setup, database, Google sign-in with invites, a basic admin dashboard, resume upload parsed into the master profile, job targets with search titles, data export and account deletion, nightly backup | Users can sign in, build a profile and define what they want |
| 2. Daily feed | Scraper service, phase 2 sources, watched companies, jobs and postings, last-seen tracking, firm limits, both scores with reasons, pay estimates, rescore button, Discord notifications | A scored list of new jobs arrives every day |
| 3. Feedback | Grading with reasons, learned preferences, target change prompts | Matches improve with use |
| 4. Tailored documents | Item selection per job, cover letter drafts, a minimal tailored resume on one template, approval, PDF output, source tracking | A tailored letter and resume for any job in the feed |
| 5. Tracking board | Applications, statuses, linked documents | One place to see every application |
| 6. Suggestions and questions | General and job-specific suggestions, profile questions, skill gap flags | The profile gets stronger over time |
| 7. Market suggestions | Wider-search counts, related search titles | Guidance when a target is too narrow |
| 8. Resume builder | Form editor, standing resumes, more control over tailored resumes | Full resumes built and maintained in the app |
| 9. Auto-apply add-on | Form filling with approval, optional automatic sending | Applications submitted from the app |

Coming-soon sources are added between phases, starting with Alberta Health Services and Recovery Alberta once the phase 2 feed has run reliably.

## Risks

| Risk | Mitigation |
| --- | --- |
| Job boards change and JobSpy breaks | One interface per source, run logs per source, public feeds as a stable base |
| Job board terms restrict automated access | Low daily volume, no logins, prefer public feeds, respect robots.txt. Alberta Health Services' terms limit use to personal and non-commercial; revisit before adding it. |
| Other people's personal data on a home server | Invite-only access, tunnel instead of open ports, encrypted backups, admin cannot read member data, self-serve export and deletion |
| Backups live on the same server | Accepted for now: a second drive covers a boot drive failure, but fire or theft would lose everything. An off-server copy can be added later. |
| Two different roles merged as one job | Users can mark postings as not duplicates |
| AI costs creep up | Firm limits first, score threshold, rescore limit, per-member spend cap |
| AI invents or exaggerates experience | Profile as the only fact source, source tracking on every line, questions in place of assumptions, approval before use |
| Home server or internet outage | Daily run retries on next start; missed days are caught up |
| The tunnel's `cloudflared` version is flagged unsupported | Update it before the app is exposed |

## Decisions made

All the open questions from the first draft are settled.

| Question | Decision |
| --- | --- |
| Who pays for AI usage | One shared key paid by the admin, kept configurable |
| Models and cap | Haiku 5.5 for scoring, Sonnet 5.5 for writing, $10 per member per month by default |
| Tunnel | The existing Cloudflare Tunnel |
| Sign-in | Google account only, invited by the admin |
| First notification channel | Discord, then ntfy |
| Memory for Playwright | Enough: about 27 GiB free |
| Backups | Nightly encrypted dump to a second local drive |
| Missing pay | Estimated with a certainty, never treated as stated pay |
| Account deletion | Self-serve, along with data export |
