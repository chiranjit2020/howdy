# ADR-007 — Design system: token-driven Tailwind, native primitives, no UI library

**Context.** Master prompt §12–19 requires a real design system (semantic tokens, primitives, Howdy components,
accessibility, 320px-up responsiveness, reduced motion) built before product UI. Constraints discovered in Phase 0/1:
the production CSP is nonce-based (`style-src` has no `'unsafe-inline'`), and the brand palette fails WCAG for some text uses
(Muted Slate `#8D99AA` is 2.6:1 on Canvas Cream; white on Sherbet Pink is 2.0:1).

**Decision.**
1. **One source of truth for colour:** `src/ui/styles/tokens.css`. Every semantic colour is declared once as
   `light-dark(<Daylight>, <Dusk>)`; `color-scheme` is system-driven and can be forced with `<html data-theme>`.
   Tailwind's default palette, type scale, radii and shadows are reset (`--color-*: initial` …), so only Howdy tokens can be
   used. Components never contain hex (enforced by test; `layout.tsx` `themeColor` is the single, test-pinned exception).
2. **Brand palette stays; usage is corrected.** Palette values are unchanged, but text roles use darker slates
   (5.3–6.5:1), filled pastel surfaces always carry Deep Charcoal text (7.4–11:1), and Muted Slate is decoration-only.
   Contrast for every text/background pair in both themes is a unit test (`design-tokens.test.ts`).
3. **Theme without inline scripts:** the choice lives in a plain cookie read by the root layout on the server, so first paint
   is correct and the CSP needs no script exception.
4. **Primitives are hand-written on native elements:** `<dialog>` for Modal/Drawer/Dialog/ConfirmationDialog (browser focus
   trap, inert background, Esc, focus restore), native inputs for Checkbox/Radio/Select, `role="switch"` button, and small
   WAI-ARIA implementations for Tabs, menu (Dropdown), Popover, Tooltip and Toast. No Radix/Headless UI/etc.
5. **No inline `style` attributes** in components (blocked by the CSP); all styling is classes/tokens.
6. **Tokenised typography** (display/heading/title/body/caption/metadata/code) via `next/font` (self-hosted, no runtime
   Google request): Google Sans (UI; was Plus Jakarta Sans until 2026-10-01, changed at the user's request), JetBrains Mono, Fraunces.
7. **Motion** communicates state only and is removed globally under `prefers-reduced-motion`. The Post Card "flip" renders
   only the visible face (entrance animation) rather than a two-sided 3D card, so height follows content and hidden content is
   never reachable by keyboard/screen reader.
8. **Verification is layered:** token tests (parse + compile with Tailwind), jsdom + axe + Testing Library for behaviour, and
   Playwright against a *production* build (real CSP) for what jsdom cannot see (CSS, fonts, CSP, touch targets, 320px).

**Alternatives.** Radix UI/shadcn (faster, but adds a dependency surface and inline-style/CSP friction, and hides behaviour we
must be able to test and own); CSS-in-JS (CSP nonce plumbing, runtime cost); Storybook (deferred: `/workshop/kit` covers
visual QA without another toolchain); a true two-faced 3D flip (dead space from the taller face, more a11y risk).

**Consequences.**
- We own keyboard/ARIA correctness for ~10 interactive patterns → they are covered by behaviour tests. Popover/Dropdown
  placement is CSS-only (below the trigger, start/end aligned) with no collision detection; revisit if a menu ever clips.
- `/workshop/kit` is dev-only (404 in production) unless `ENABLE_DESIGN_KIT=1`, which exists solely for the e2e run.
- `pointer-fine:` variants let compact controls shrink on desktop only; every control keeps a ≥44px target on touch.
- Changing the palette means editing `tokens.css`; tests will say which pairs stop meeting AA.
