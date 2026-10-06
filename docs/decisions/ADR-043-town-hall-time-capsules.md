# ADR-043 — Time Capsules for a Town Hall

**Context.** ADR-028 built Time Capsules for one's future self or one Pal and listed "Capsules to a Town Hall" as not
in that slice. Town Halls now have a feed (ADR-033) and staff (ADR-041), which give such a capsule an obvious place to
open and obvious people to send it.

**Decisions (the user's, 2026-10-06).**
1. **Only the owner and Deputies seal one.** It is a message to the whole Town Hall, so the people who keep order send
   it; ordinary members cannot (fewer unscreenable future posts).
2. **It opens as a post in the feed**, written by its sealer, with a "Time Capsule" stamp and "Sealed on <day>".
3. **It opens even if the sealer has since left or been banned.** (Unlike a Pal capsule, which never opens once the two
   are no longer Pals: there the relationship is the point; here the Town Hall is.)

## How it works
- Table `town_hall_capsules (id, town_hall_id, author_id, body, open_on, created_at)` and a nullable
  `town_hall_posts.capsule_sealed_at`. Migration `0035_town_hall_capsules`.
- **Sealed means sealed for everyone**, as in ADR-028: no read selects `body` from `town_hall_capsules`; only the
  opening does, and it moves the words straight into a post.
- **Rules.** The words follow a post's rules (1–280, no links, the usual character screening) because they become one.
  A day from tomorrow to 5 years in Howdy's calendar (Asia/Kolkata). At most 10 waiting per Town Hall; 10 seals a day
  per person, and the first-week limit for capsules (ADR-024). Everyone but staff gets the usual staff-tool 404.
- **Members see what is coming**: who sealed it and the day, never the words (a "Time Capsules" card on the Town Hall;
  staff also get the form). Someone the viewer has hidden shows as "a member". Outsiders learn nothing.
- **Opening** happens the first time a member reads the feed (or the Town Hall page) on or after the day, or in the
  daily job (`openHallCapsules` in `pnpm jobs:purge`), whichever is first. In one transaction the capsule row is deleted
  (`delete … returning`) and the post inserted, so two members opening at once make one post. A suspended or closing
  sealer makes it wait. The post is held for staff's OK — like any post — if the sealer is no longer staff and is being
  reported by several people lately (staff's own words are never held, ADR-041).
- **Taking one back** (deleting it before it opens): its sealer, even after leaving, or staff who outrank the sealer
  (the owner over a Deputy's). A Deputy cannot take back the owner's.
- After opening it is an ordinary post: reactions, replies, reports, take-downs; kept like any post.
- No Chime: hall posts never ring members (ADR-033), and the sealer sees it in the feed.
- Privacy Policy 1.14.0 (no re-acceptance). `longDay` moved to `src/shared/calendar.ts` with a fixed `en-GB` locale so
  server and browser render the same text.

## Alternatives considered
- **Reuse `time_capsules`** with a nullable Town Hall — its recipient is NOT NULL and every rule there is about two
  people; a second table keeps both simple.
- **Any member seals** — more playful, but each capsule is a future post nobody can screen until it opens.
- **Never open if the sealer left** — matches Pal capsules, but the user chose that the Town Hall, not the person, is
  what the capsule is for.
- **Open as a separate "capsule" item** rather than a post — another surface to moderate and render; a post already has
  reactions, replies, reports and take-downs.

## Consequences / known limits
- Sealed hall capsules are not in "Download my data" (sealed words are returned to nobody, ADR-028); once opened they
  are posts, which are.
- They are managed on the Town Hall page, not on `/capsules`.
- A capsule opens on the first feed read after midnight India time, or at the daily job; a quiet Town Hall's capsule
  may show up some hours into its day, dated when it opened.
