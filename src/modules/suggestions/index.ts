/**
 * Public surface of the suggestions module: "Pals you may know" (Phase 13, ADR-029). Depends on authz and profiles;
 * nothing depends on it.
 */
export { dismissSuggestion, palSuggestions, MIN_SHARED } from './service';
export type { PalSuggestion } from './service';
