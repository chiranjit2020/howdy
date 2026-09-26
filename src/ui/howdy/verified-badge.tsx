import { Art } from '../art/glyph';
import { cn } from '../cn';

/**
 * The blue badge beside the Howdy team account's name. The picture is decorative; screen readers hear "Verified" as part
 * of the name, and hovering shows what it means.
 */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <span title="Verified · the Howdy team" className={cn('inline-flex shrink-0 align-[-0.2em]', className)}>
      <Art name="verified" size="free" className="size-[1.15em]" />
      <span className="sr-only"> (Verified)</span>
    </span>
  );
}
