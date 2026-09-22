import { cn } from '../cn';

/**
 * Four hand-tuned organic blob outlines (smooth cubic curves, uneven lobes), all in a 200x200 box. Pick a `shape` and give
 * the fill through the class (`fill-auth-blob-peach`), size and position through the rest. Decorative, so hidden from
 * assistive tech. Being SVG paths (not rounded boxes) lets the curves flow instead of reading as a squashed circle.
 */
const PATHS = [
  'M100 4C123.4 7.4 142.6 49.9 158.7 76.3C174.9 102.6 194.4 119.8 180.7 135.9C166.9 152 120.7 152.6 90 156.7C59.3 160.9 37 176.2 27.4 156.7C17.7 137.2 27.3 89.8 41.8 59.3C56.3 28.7 76.6 0.6 100 4Z',
  'M107 33.2C128.7 27.6 154.4 14.5 164.7 31.7C175 48.8 161.9 89.8 158.5 118.8C155 147.9 166.8 169 147.4 176.8C128.1 184.5 87.6 167.5 61.6 157.5C35.7 147.4 18.9 146 17.8 126.5C16.7 106.9 38.3 78.4 56.2 59.7C74 41.1 85.3 38.8 107 33.2Z',
  'M90.6 10.3C115.7 16.1 136.4 52.3 155.6 78.7C174.7 105 199 124.5 186.3 142.1C173.5 159.7 117.7 168.1 91.8 166.7C65.9 165.3 69.1 158.5 56.7 135C44.4 111.5 23.3 74.2 30.1 49.2C36.9 24.3 65.5 4.4 90.6 10.3Z',
  'M94.5 36.9C122.8 39.6 162.5 38.1 178.5 51.7C194.6 65.4 183.6 77.4 174.7 105C165.8 132.6 155.3 181.2 134 189.8C112.6 198.4 90.8 160.4 68 147.9C45.2 135.4 26.2 149.3 20.1 127.3C13.9 105.3 22.2 56.1 37.1 38C52 19.9 66.2 34.1 94.5 36.9Z',
] as const;

export function Blob({ shape, className }: { shape: 0 | 1 | 2 | 3; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
      className={cn('pointer-events-none absolute', className)}
    >
      <path d={PATHS[shape]} />
    </svg>
  );
}
