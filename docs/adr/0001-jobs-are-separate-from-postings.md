# Jobs are separate from postings

The same role is routinely advertised on Indeed, LinkedIn and the employer's own career page, each with a different link, so removing duplicates by link would show and score one role several times. We decided that a job is identified by normalized company, title and location, and that each advertisement is a posting attached to it; scoring, matches and applications hang off the job, never the posting.

## Considered options

- **Unique by link.** Simplest, but cross-posting is the normal case, and every duplicate costs a model call and a notification.
- **Company + title + location (chosen).** Occasionally merges two genuinely different roles that share a title and city.

## Consequences

- Wrong merges are corrected by a user marking postings as not duplicates. Because jobs are shared, that split applies to every user, and each split is logged with who made it.
- A job shows every posting link. Where one exists, the employer's career-page posting is the preferred apply link.
