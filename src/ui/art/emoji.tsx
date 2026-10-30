import type { ReactionKind } from '@/shared/validation/fence';
import { cn } from '../cn';
import { Img } from './img';

/**
 * A reaction's emoji, from the Fluent Emoji set (Flat; MIT, see /public/emoji/fluent/LICENSE.txt). SVG, so it is sharp at
 * every size; self-hosted, so no outside request and nothing the Content-Security-Policy has to allow. Always
 * decorative (empty `alt`): the label beside it, or the button's name, says what it is.
 */
export function ReactionEmoji({
  kind,
  className,
  loading,
}: {
  kind: ReactionKind;
  className?: string;
  loading?: 'eager' | 'lazy';
}) {
  return (
    <Img
      src={`/emoji/fluent/${kind}.svg`}
      width={32}
      height={32}
      alt=""
      className={cn('inline-block size-5', className)}
      {...(loading ? { loading } : {})}
    />
  );
}
