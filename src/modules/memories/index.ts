/**
 * Public surface of the memories module: "on this day" (Phase 12, ADR-028). Read-only and computed: it stores nothing.
 * Depends on profiles and relationships (who I can still see); nothing depends on it.
 */
export { memoriesToday } from './service';
export type { CardMemory, MemoriesToday, PalMemory, TributeMemory } from './service';
