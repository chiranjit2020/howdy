/**
 * Product content limits. Shared by UI (maxLength, counters) and — later — server validation,
 * which is the authority. Values are deliberately small (see PRODUCT_DISCOVERY.md, C1) and may change after testing.
 */
export const LIMITS = {
  /** Raised from 160 / 80 on 2026-11-03: too tight, above all in Indian scripts, where vowel signs count as characters. */
  POST_CARD_MAX: 500,
  REPLY_MAX: 280,
  WHISPER_MAX: 280,
  /** The team's What's new note: 280 since 2026-11-08 (80 could not fit a two-step how-to). */
  SIGNAL_MAX: 280,
  BIO_MAX: 150,
  TRIBUTE_MAX: 280,
  TOWNHALL_NAME_MIN: 3,
  TOWNHALL_NAME_MAX: 50,
  TOWNHALL_DESCRIPTION_MAX: 280,
  TOWNHALL_POST_MAX: 280,
  /** A group event's name and place (ADR-056). */
  EVENT_TITLE_MAX: 80,
  EVENT_PLACE_MAX: 80,
  /** A group poll (ADR-057): its question, each option, and how many options. */
  POLL_QUESTION_MAX: 140,
  POLL_OPTION_MAX: 60,
  POLL_OPTIONS_MIN: 2,
  POLL_OPTIONS_MAX: 4,
  HANDLE_MIN: 3,
  HANDLE_MAX: 24,
} as const;
