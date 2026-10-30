import Link from 'next/link';
import { Img } from './art/img';
import { cn } from './cn';

// Sized by whole-pixel HEIGHT (width follows): sized by width, the height came out fractional (29.54 px) and the logo
// shimmered up and down in the sticky bar while scrolling. `bar`: smaller on the narrowest phones so the two sign-in
// buttons fit beside it.
const LOGO_HEIGHT = { lg: 'h-21', sm: 'h-11', xs: 'h-7', bar: 'h-6 min-[360px]:h-7' } as const;

/** The Howdy wordmark (the brand artwork). Links to the Gate unless told otherwise (signed-in pages point it at Home). */
export function HowdyLogo({
  size = 'sm',
  href = '/gate',
  className,
}: {
  size?: keyof typeof LOGO_HEIGHT;
  href?: string;
  className?: string;
}) {
  return (
    // min-h-11: the small top-bar logo is only ~35 px tall, and a link must be at least 44 px to tap.
    <Link
      href={href}
      className={cn('inline-flex min-h-11 items-center no-underline hover:no-underline', className)}
    >
      <Img
        src="/brand/howdy-wordmark.png"
        width={728}
        height={224}
        alt="Howdy"
        loading="eager"
        className={cn('w-auto', LOGO_HEIGHT[size])}
      />
    </Link>
  );
}
