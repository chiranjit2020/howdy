/**
 * Public surface of the suggestions module: finding people. "Pals you may know" (Phase 13, ADR-029) and people search
 * (only people who allow it, plus your friends). Depends on authz and profiles; nothing depends on it.
 */
export { dismissSuggestion, palSuggestions, searchPeople, MIN_SHARED, SEARCH_MIN_LENGTH } from './service';
export type { PalSuggestion, PersonResult } from './service';
