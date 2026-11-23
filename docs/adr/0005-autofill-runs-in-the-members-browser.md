# Autofill runs in the member's own browser, and the member submits

The first version of auto-apply fills in an employer's application form for the member, and the member reviews it and presses the employer's own submit button. Most of the forms that matter sit behind a sign-in (LinkedIn, Workday, Indeed). Rule 7 rules out storing those logins, and a server-side browser holding a live session would be the same thing in practice. So the filling happens in a small Chrome extension in the member's own browser, where they are already signed in. The server only hands out what the form needs.

## Consequences

- The member starts it. **Autofill** on a job's page creates an apply session and opens the posting in a new tab. The extension fills what it can, marks every field it touched, and never presses submit. Sending stays the member's own act (rule 6). The application records submission method `assisted` and approval state `approved`, because the member chose to apply with those documents.
- The extension talks to the app through `/api/apply/<ticket>/…` route handlers, which are an exception to "no REST API". Each apply session has its own random ticket, stored only as a hash. The ticket is the permission: it opens one application's packet for two hours, so the extension holds no long-lived credential and no session cookie.
- A packet contains only what the form asks for: contact details, the application's approved resume and cover letter as PDFs, the member's standard answers and saved answers. It never includes the master profile.
- Questions the extension can't answer from the packet go to one model task, `answerApplicationQuestions`. Its only facts are the master profile and recorded noes, so rule 1 holds. It returns no answer rather than guessing, and every AI-filled field is highlighted for review.
- Standard answers (work authorization, sponsorship, notice, salary expectation, self-identification) are data the member sets once on the Autofill page. The defaults for self-identification questions are "prefer not to say".
- The extension is built from `web/extension/` and served by the app as a zip, with the app's own address written into its manifest. Each self-hosted instance therefore gets an extension that talks to it. It is installed unpacked, with no store listing.
- Fully automatic sending is still a future add-on. It would need its own decision about which sites allow it and how a member opts in.
