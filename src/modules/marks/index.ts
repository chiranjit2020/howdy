/** Public surface of the Marks module: the one word friends pick to describe someone (ADR-052). */
export { getDescription, giveMark, takeBackMark, MIN_DESCRIBERS, TOP_WORDS, RATE } from './service';
export type { Description } from './service';
export { marksExport } from './export';
export type { MarksExport } from './export';
