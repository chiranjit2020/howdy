# ADR-062 — Friend and follower numbers are public

Status: accepted (2026-11-09). Supersedes the "follower count: the owner only" decision of ADR-053 and the owner-only
friend count of the profile card (stage 1).

## Why

You decided that people expect to see these numbers on a profile, and that hiding them takes away a reason to come
back and grow a circle: "We need to feed their ego." Howdy should not impose its own taste on how people enjoy it.

## Decisions taken with you (2026-11-09)

- **Both numbers, for everyone** who may open the profile: "48 friends · 3 followers". The friend number was picked
  because following is only for non-friends, so early on most people have few followers but some friends.
- **No switch to hide them.** Like Instagram: the numbers say nothing about who.

## Decisions

1. **One count for owner and visitors** (`relationships.profileCountsOf`): accepted friendships and follows where the
   other account is `active`. A suspended or closing account does not prop a number up, and the owner's figure is the
   same one visitors see.
2. **Numbers only, never who.** The friend list on a profile stays the owner's alone (PosseCard); there is still no
   followers list for anyone. On your own profile the friend number links to your Friends page; elsewhere it is text.
3. **Followers show from the first one** (no "0 followers"); the friend number always shows.
4. **Privacy Policy 1.30.0** says who sees the numbers; no re-acceptance (no new data, no new use).
5. **The welcome page** no longer says the numbers are shown only to you.

## Trade-off accepted

Public numbers bring back some comparison between people, which the welcome page used to say Howdy avoids. Reaction
counts were already public; this extends the same to profiles.
