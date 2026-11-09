# ADR-053 — Following brings someone's own posts to your Home

Status: accepted (2026-11-01). Supersedes the "Scouting grants nothing" part of ADR-010. The owner-only follower count
was superseded by ADR-062 (2026-11-09): friend and follower numbers are public.

## Why

"Following" existed but did nothing: it was a private label that changed no feed, notification or permission. You
asked for a real use: following someone you are not friends with, such as a sportsperson, and taking motivation from
what they post.

## Decisions taken with you (2026-11-01)

- **Follow is for non-friends.** On a friend's profile the button is gone, because their posts already reach you.
  Friends get Close friend instead.
- **Nobody is told** when someone follows them.
- **Follower count: the owner only.** It shows on your own profile after your friend count ("3 friends · 12
  followers"), once anyone follows you. Visitors never see it.

## Decisions

1. **Home's feed adds the people you follow.** The feed's walls are now your own, your friends' and the people you
   follow. **Every wall still passes its own page's read rule** (`canFence 'fence:read'`). A wall only friends may read
   (`fenceVisibility: posse`), a block either way, or an inactive account adds nothing, exactly as its page would refuse
   you. Mute still hides them.
2. **From someone you only follow, just their own posts:** cards where author = wall owner. You follow them, not
   everyone who writes on their wall. A friend you also follow comes once, with their whole wall.
3. **Follow is offered only where it brings something:** on a non-friend's profile whose wall you may read. If you
   already follow someone, the button stays so you can unfollow.
4. **The count** (`followerCountOf`) counts follow rows. Deleted accounts take their follows with them, and a block
   removes any follow either way. It is a number, never who.
5. **Words:** Home's heading is "Posts" (no longer "Friends' posts"). The welcome page no longer promises "never
   followers"; it says friends are both ways, you can follow people you look up to, and there are no public follower
   counts.

## Not done (yet)

- **Verified public figures.** Anyone can create an account named after a celebrity, and only the team account
  carries Verified. Following a famous person is only as trustworthy as that account; verifying public figures is
  separate work.
- **No "Followers" list** for the owner: only the number.
