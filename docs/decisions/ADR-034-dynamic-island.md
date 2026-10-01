# ADR-034 — The Dynamic Island (and installing from it)

Status: accepted (2026-10-01). Asked for by you: a Dynamic Island-style pill on landing that tells people to install the
app, because several Android phones never show the browser's own install pop-up; built so later features can use it.

## Context

ADR-022 made Howdy installable and kept Chrome's `beforeinstallprompt` for an **Install Howdy** button, but that button
lives on the Chimes page, so only signed-in people who go looking find it. Many Android browsers never fire the event
at all (Samsung Internet, Firefox, MIUI/Opera variants, in-app browsers like Instagram's), and Chrome stops firing it
after a dismissal; iPhones never do. So on most phones nothing ever said "you can install this".

## Decisions

1. **One island, one activity at a time.** `src/ui/island/store.ts` is a small browser-only queue: any feature calls
   `showActivity({ id, priority, icon, label, expanded?, onDismiss?, autoExpandMs? })` and `dismissActivity(id)`. The
   island (`DynamicIsland`, mounted once by `PwaBoot`, so on every page signed in or out) shows the highest priority,
   then the oldest. Compact = icon + a few words; tap = it grows into a card with the expanded face; × dismisses;
   Escape / tapping outside folds it. Near-black in both themes (`--color-island*` tokens), drops in with a spring,
   no motion under reduced-motion. It floats just *under* the top bar (not over it), so it never covers the logo or
   the sign-in buttons on a 320 px phone. 44 px targets, a labelled region, `aria-expanded` on the pill.
2. **Install is the first activity** (`InstallIsland`, priority 10). It appears 2.5 s after landing, on phones only
   (or anywhere the browser offers to install), never when already running as the installed app, and opens itself
   once. Where the browser offers its own dialog, the card has an **Install Howdy** button; everywhere else it shows
   the steps *for that browser*: Chrome/Edge/Opera (⋮ → Install app), Samsung Internet (☰ → Add page to → Home
   screen), Firefox, iPhone (Share → Add to Home Screen), and in-app browsers ("Open in browser" first). The user
   agent only picks the words; it gates nothing.
3. **× snoozes it for 14 days on that device** (`localStorage`, wrapped in try/catch — private mode just asks again).
   Installing removes it at once (`appinstalled`).

## Ideas for the island next (not built — for you to pick)

- **Porch Light on** — while your light is lit, a live pill "Porch Light · 1 h 12 m left", tap to switch off.
- **New Whisper** — when one arrives while you are elsewhere in the app: "Ravi whispered", tap to open the thread.
- **Upload progress** — a photo on its way up ("Uploading… 60 %"), so you can keep scrolling.
- **Time Capsule opened today** — "A capsule from Ana opened 💌".
- **Back online / offline** — "You're offline — we'll send it when you're back".
- **Pal is on their Porch** — a Pal just lit their Porch Light (only to people their light reaches).
- **Turn on Chimes** — after installing, a one-tap "Get Chimes on this phone" (the push opt-in from ADR-022).

Each would be a few lines: decide when to call `showActivity`, with a priority above install for anything live.

## Consequences

- E2E contexts snooze the install activity by default (`newContext`), since it floats over the page; `island.spec.ts`
  turns it on with `island: true`.
- Desktop browsers that do not offer to install see nothing.
