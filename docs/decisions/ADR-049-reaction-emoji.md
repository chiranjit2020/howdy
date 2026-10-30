# ADR-049 — Reaction emoji engine (Fluent Emoji)

Status: accepted (2026-10-30). Asked for by you: replace the small illustrated reaction PNGs with a real emoji set.

## Decisions taken with you (2026-10-30)

- **Microsoft Fluent Emoji**, the Flat style (it matches Howdy's flat look). MIT licence, kept beside the files.
- **The same five reactions:** Wave, Laugh, Fire, Popcorn, Love.

## Decisions

1. **One catalog** (`src/shared/reactions.ts`): each kind's label and emoji character. Every place that names or draws
   a reaction reads it: post cards, group posts, stories, notifications (`Glyph` turns a reaction emoji into the
   Fluent picture), the welcome page and the share image.
2. **One component** (`ReactionEmoji`, `src/ui/art/emoji.tsx`) draws `/public/emoji/fluent/<kind>.svg`. Always
   decorative (`alt=""`): the button's name or the label beside it says what it is.
3. **Self-hosted SVG, no CDN or emoji font.** No outside request (nothing for the Content-Security-Policy to allow, no
   tracking), sharp at every size, and the same picture on every phone (native emoji differ per device and old phones
   show boxes). The files were checked before adding: shapes only, no scripts, links or styles.
4. **The database keeps only the kind** (`yos.kind`, story reactions), so changing the pictures needs no migration.
   Adding a kind does: the check constraints list the five, and `REACTION_KINDS` with them.
5. The old `public/art/react-*.png` files are gone; Wave is 👋 everywhere (it was drawn as 🤘).
