/**
 * Product content limits. Shared by UI (maxLength, counters) and — later — server validation,
 * which is the authority. Values are deliberately small (see PRODUCT_DISCOVERY.md, C1) and may change after testing.
 */
export const LIMITS = {
  POST_CARD_MAX: 160,
  REPLY_MAX: 80,
  WHISPER_MAX: 280,
  SIGNAL_MAX: 80,
  TRIBUTE_MAX: 280,
  TOWNHALL_NAME_MIN: 3,
  TOWNHALL_NAME_MAX: 50,
  TOWNHALL_DESCRIPTION_MAX: 280,
  TOWNHALL_POST_MAX: 280,
  HANDLE_MIN: 3,
  HANDLE_MAX: 24,
} as const;
