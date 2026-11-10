# ADR-063 — Writers can edit their posts

Status: accepted (2026-11-11).

## Why

People could only take a post down, not fix it. A friend asked for it in a post on Home ("Could you kindly enable the
'Edit' feature?"), and a typo is not a reason to lose a post's stars and replies.

## Decisions

1. **Only the writer edits**, from "Edit post" in the post's ⋯ menu. The words turn into a box right where they were;
   Save keeps the new words, Cancel or Esc leaves them. Not the wall's owner (they can still take a post off their wall).
   Anyone else gets the same 404 as a missing post.
2. **Words only.** The photo stays as it is. A photo post may lose its words; a words-only post may not become empty.
   The words get every check a new post gets (500 characters, no links, no disguising characters).
3. **"Edited" is shown to everyone** next to the time (`post_cards.edited_at`, migration 0057), so a post cannot be
   quietly changed after people reacted to it. Saving the same words changes nothing and adds no mark. No edit history
   is kept: a report already keeps its own copy of the words (evidence snapshot), so editing cannot erase evidence.
4. **Approved words cannot be swapped.** On someone else's wall, an edit to a published post goes through the same rule
   as a new post from that writer: with Review on it waits for the owner again (and the owner is told, as for a new
   post); a restricted or anti-spam-held writer's edit is held without being told. A waiting post loses its pin. The
   owner's own posts on their own wall never wait.
5. **Only while you may still write on that wall.** A writer the owner has since blocked can no longer edit there
   (taking a post down stays always allowed).
6. **30 edits an hour per person**: plenty for typos, too few to keep rewriting a post.
7. **No time limit** for now: the "Edited" mark covers the honesty concern. Revisit if people misuse it.

## Not now

- Editing replies and group posts (same pattern if people ask for it).
- Changing or adding a photo while editing.
