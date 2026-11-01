# ADR-059 — Feedback about Howdy, inside the app

Status: accepted (2026-11-02). Asked for by you: a feedback route inside the app.

## Decisions taken with you (2026-11-02)

- **Stored and emailed:** feedback is kept in the database and listed in the Control Room (/admin/feedback), and each
  one is also emailed to the admins (and the operator's report address) through the usual mailer.
- **Text only:** no screenshots (storage, and screenshots can capture other people's private messages).

## Decisions

1. **/feedback** (signed in, Home's frame): what kind (An idea / Something's broken / Something else: three tiles,
   sunflower when chosen), up to 1,000 characters, and the page it came from (`?from=`, set by the links into it).
   Ways in: the phone's You sheet, the desktop account menu, and a line at the end of every Settings page.
2. **Table `feedback`** (migration 0050): user, kind, body, page, status (new / read / done), sent and handled times.
   The database checks the kind and status lists, the length, and the page's shape. Deleted with the account
   (`on delete cascade`) and a year after it was sent (the purge job; the Privacy Policy's figure).
3. **The page is a plain in-app path only**: one leading "/", then letters, digits and `/_.@-`; no host, no query
   string (nothing that could carry a token), and never "//" (a browser reads "//site" as another site, and the
   thank-you page links back to the page). The same pattern in the app and the database; a test sends the hostile
   shapes.
4. **Limits:** 5 an hour and 20 a day per person, plus 5 a day in an account's first week (ADR-024), spent before
   anything is stored. Always from the signed-in person: any "from" in the request is ignored.
5. **Reading it:** admins with two-step only (`adminStanding` = ready), like the rest of the Control Room; anyone else
   gets the plain 404, from the page, the data function and the API alike. Marking (read / done / new) flips at once
   and saves in the background.
6. **Email:** sent after the response (`runAfterResponse`), plain text: who (name and @username), kind, page, words,
   and a link to the inbox. Never the sender's email address.
7. **Privacy Policy 1.27.0:** feedback is collected, read only by admins (who get a copy by email), kept a year. In the
   data export (`feedbackISent`).
