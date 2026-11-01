# ADR-058 — Ways to reach you on a profile, and the details form in steps

Status: accepted (2026-11-01). Asked for by you: the Edit details popup was too long and had no website, email, phone or
social handles.

## Decisions taken with you (2026-11-01)

- **New details:** website, contact email, phone, and usernames on Instagram, LinkedIn, X, YouTube and Facebook.
- **A phone number or contact email is for Friends or Only me, never Everyone on Howdy.** A public number in India brings
  scam calls, WhatsApp spam and harassment, and friends can already message each other on Howdy.
- **Links are clickable, made safe.** These are the first links to other sites anywhere in Howdy (ADR-024 kept all text
  plain).
- **The form is four steps** (About you, Personal, Contact, Social) with Back, Skip and Next.

## Decisions

1. **Columns on `profile_details`** (migration 0048): `website`, `email`, `phone`, `instagram`, `linkedin`, `x_handle`,
   `youtube`, `facebook`, and audiences `website_audience`, `email_audience`, `phone_audience`, `socials_audience` (the
   five sites share one, so the form stays short). Default audience: Friends, like every detail (ADR-050).
2. **The database enforces the rules too:** email and phone audiences only `posse`/`only_me`; a website must start with
   `https://`, at most 200 characters, no spaces; email and phone shapes; each handle its site's pattern (the same
   patterns as `SOCIAL_PATTERN`; a test compares them with the constraints).
3. **Website** (`websiteSchema`): https only (http, `javascript:`, `data:` refused); "example.com" gets its "https://";
   no name or password in it; a real domain, not an IP address or `localhost`; no disguising characters. It is stored as
   the URL parser writes it, so an internationalised domain is stored and shown in its `xn--` form, never as look-alike
   letters. Shown without "https://" and "www.".
4. **Social handles, never links.** People type a username or paste a link to their profile; a link to that site
   becomes its handle (`socialHandle`), anything else is refused. Howdy builds every link itself (`socialUrl`), so it can
   only ever point at the real site. Brand marks are shown for them: the one place logos appear, because they say which
   site the link opens.
5. **How links open:** https links in a new tab with `rel="noopener noreferrer nofollow ugc"` (the other site never
   learns which profile sent someone; no search-engine credit); email as `mailto:`, phone as `tel:` (digits only).
6. **Who sees them** is decided at read time like every detail (ADR-050): signed-out visitors never, a block hides all,
   only the owner sees audiences.
7. **The form in steps.** Each step saves only its own details when you press Next (or Back, or jump with the step bar),
   and only if something changed, so closing part-way keeps what was saved. Skip drops that step's edits and moves on.
   A refused step stays put with the message on its field. Who sees each detail is a small picker at the end of its label
   row ("Everyone", "Friends", "Only me"; "Everyone" can only overstate who sees it, since signed-out visitors never do).
8. **Privacy Policy 1.26.0** describes every detail (ADR-050's were missing) and these; no re-acceptance (nothing new is
   collected unless you add it). In the data export through `myDetails`.
