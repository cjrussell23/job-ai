# A standing resume can be shared through a public link

Members want their portfolio sites to show the same resume they keep in the app, rather than a second copy that drifts. We decided a member may share any standing resume through an unguessable link, which a site can read without signing in. It is the one public, read-only API in an app that otherwise has none.

## Consequences

- Sharing is the member's own action, per resume, and off by default. Stopping it kills the link for good; sharing again makes a new one. Duplicating a resume does not copy its link.
- Two routes serve it: `/api/public/resumes/<token>` as JSON and `/api/public/resumes/<token>/pdf` as the same PDF the builder downloads. Only standing resumes can be shared, never tailored documents or cover letters.
- The JSON is the resume's text and nothing more: no profile item ids, line sources or other profile items. Contact details are included because they are on the resume; the builder says so before sharing.
- Looking a resume up by its token is the one query on user-owned data that does not filter by user (rule 9). The token is the permission, and it can only match a resume its owner chose to share.
- PDFs are rendered once per saved version and kept in memory, so a public link cannot make the server start Chromium on every request.
