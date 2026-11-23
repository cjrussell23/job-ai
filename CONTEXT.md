# Job Search App

The language of a self-hosted app that finds jobs for a small group of invited users, scores them against what each user wants, and drafts application documents from facts the user has supplied.

## Language

### Jobs

**Job**:
One role at one company in one location, shared across all users, however many places it is advertised.
_Avoid_: Listing, opening, position

**Posting**:
One advertisement of a job on one source, with its own link. A job has one or more postings.
_Avoid_: Listing, link, duplicate

**Source**:
A place postings are fetched from, such as a job board or a company's career feed.
_Avoid_: Scraper, provider, site

**Watched company**:
A company whose career feed is checked every run, added by a member or discovered from a posting. The list is shared by all users.
_Avoid_: Followed company, tracked employer

**Last seen**:
The date of the most recent run in which a posting was still found on its source.
_Avoid_: Updated date, scraped date

**Missing**:
The state of a posting that was not found on its most recent run. Shown to the user immediately.
_Avoid_: Stale, expired, removed

**Closed**:
The state of a job whose postings have all been missing for three consecutive runs. Closed jobs leave the feed but remain on applications.
_Avoid_: Expired, archived, deleted

**Pay estimate**:
A pay range the app guesses for a job whose postings state none, always carrying a certainty and always labelled as an estimate. Never treated as stated pay.
_Avoid_: Predicted salary, inferred pay

**Application system**:
The software an employer uses to receive applications for a job, such as Greenhouse, Lever or Workday.
_Avoid_: ATS, platform

### What the user wants

**Job target**:
A user's saved description of a job they want: role type, location, pay and a free-text note. A user keeps several.
_Avoid_: Search, filter, preference, criteria

**Search title**:
A job title searched for on behalf of a job target. Proposed by the AI from the role type, then approved by the user.
_Avoid_: Keyword, query, search term

**Firm limit**:
A job target field that a job must satisfy to be shown at all.
_Avoid_: Hard filter, requirement, dealbreaker

**Preference**:
A job target field that raises or lowers a score but never hides a job.
_Avoid_: Soft filter, nice-to-have

**Pay basis**:
Whether a job target states its minimum pay as an hourly rate or an annual salary. Chosen per job target.
_Avoid_: Pay type, rate type

**Desired hours**:
The hours per week a user wants to work for a job target, used to compare hourly and annual pay.
_Avoid_: Availability, FTE

**Unknown**:
The state of a job field the posting does not state. Unknown is never the same as failing a firm limit.
_Avoid_: Missing, null, not listed

### Scoring

**Match**:
The app's assessment of one job against one of a user's job targets. A job can have a match for each target it was checked against.
_Avoid_: Suggestion, recommendation, result

**Target fit**:
The score, with a reason, for how well a job suits a job target.
_Avoid_: Job score, relevance

**Profile fit**:
The score, with a reason, for how well the user's master profile suits a job.
_Avoid_: Qualification score, candidate score

**Rescore**:
A user-requested re-run of scoring on their live matches after they have changed their master profile or a job target. Never triggered by saving alone.
_Avoid_: Refresh, recalculate, re-run

**Live match**:
A match whose job is not closed, that the user has not dismissed, and that has no application yet.
_Avoid_: Active match, open match

### The user's facts

**Master profile**:
Everything a user could truthfully put in an application. The only source of facts for generated documents.
_Avoid_: Profile, CV, resume data

**Profile item**:
One fact or piece of writing in a master profile, such as a role, bullet, project, skill, certification, story or note.
_Avoid_: Entry, record, field

**Suggestion**:
A proposed rewording of one profile item's text, which the user accepts or rejects. It never adds a fact.
_Avoid_: Recommendation, improvement, fix

**Profile question**:
A neutral yes-or-no question about experience the master profile doesn't show. A yes adds one example as a profile item; a no is kept, never asked again, and never claimed.
_Avoid_: Prompt, survey, gap question

**Skill gap**:
A requirement that recurs in a user's matches and that they answered no to, shown as worth learning.
_Avoid_: Missing skill, weakness

**Match summary**:
A short AI read of one strong match for one user: what fits them, what to watch, and what to ask. Written only for matches at or above the user's summary score (never below the admin's minimum), and rated by the user to improve later ones.
_Avoid_: Job summary, digest

**Practice set**:
Interview questions written for one user, either general (from their profile and targets) or for one job on their board. Each answer can be rated, and a fact in it that the profile lacks is offered as a new profile item the user accepts or rejects.
_Avoid_: Quiz, mock interview

**Recorded pay**:
Pay a user typed in for a job or confirmed from its estimate. Private to them, and known pay for their own firm limits and scoring (ADR 0003).
_Avoid_: User salary, override

### Documents

**Standing resume**:
A resume the user built or uploaded themselves, reusable across jobs.
_Avoid_: Base resume, default resume, resume version

**Tailored resume**:
A resume the AI proposes for one job, made of profile items and suggested rewordings, each line tied to the profile items it came from.
_Avoid_: Generated resume, custom resume, per-job resume

**Draft**:
The state of a tailored resume or cover letter that the user has not yet approved, or has edited since approving.
_Avoid_: Pending, unreviewed

**User-written line**:
A line the user typed directly into a tailored document, with no profile item behind it. The app offers to save it as a profile item.
_Avoid_: Manual line, custom bullet

**Approved**:
The state of a document the user has reviewed and accepted. Only approved documents can go to an employer.
_Avoid_: Final, ready, confirmed

### Applying

**Application**:
A user's pursuit of one job, which exists only once the user acts on it by saving or applying.
_Avoid_: Suggested job, lead, card

**Autofill**:
Filling in an employer's application form in the user's own browser from their contact details, approved documents and standard answers. The user reviews the form and submits it themselves (ADR 0005).
_Avoid_: Auto-submit, one-click apply, bot

**Apply session**:
One use of autofill for one application, opened by the user and identified by a short-lived ticket.
_Avoid_: Apply token, apply job

**Standard answers**:
A user's answers to questions most application forms ask: work authorization, sponsorship, notice, salary expectation and self-identification.
_Avoid_: Defaults, presets, canned answers

**Saved answer**:
A user's answer to one specific form question, kept so the same question is filled the same way next time.
_Avoid_: Remembered response, cached answer

### People

**Admin**:
The user who runs the server, invites members and configures app-wide settings.
_Avoid_: Owner, superuser

**Member**:
An invited user who is not the admin.
_Avoid_: Friend, account
