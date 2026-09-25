import Link from 'next/link';
import { Img } from './art/img';
import { cn } from './cn';

// `bar`: the top bar's logo, a little smaller on the narrowest phones so the two sign-in buttons fit beside it.
const LOGO_WIDTH = { lg: 'w-68', sm: 'w-36', xs: 'w-24', bar: 'w-20 min-[360px]:w-24' } as const;

/** The Howdy wordmark (the brand artwork). Links to the Gate unless told otherwise (signed-in pages point it at Home). */
export function HowdyLogo({
  size = 'sm',
  href = '/gate',
  className,
}: {
  size?: keyof typeof LOGO_WIDTH;
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
        src="/brand/howdy-logo.png"
        width={640}
        height={239}
        alt="Howdy"
        loading="eager"
        className={cn('h-auto', LOGO_WIDTH[size])}
      />
    </Link>
  );
}
