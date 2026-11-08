import Link from 'next/link';
import { Img } from './art/img';
import { cn } from './cn';

// Sized by whole-pixel HEIGHT (width follows): sized by width, the height came out fractional (29.54 px) and the logo
// shimmered up and down in the sticky bar while scrolling. `bar`: smaller on the narrowest phones so the two sign-in
// buttons fit beside it.
// `top`: the blue top bar's logo with the speech bubble and sparks, which needs more height to read at the same size.
const LOGO_HEIGHT = {
  lg: 'h-21',
  sm: 'h-11',
  xs: 'h-7',
  bar: 'h-6 min-[360px]:h-7',
  top: 'h-9 min-[360px]:h-10',
} as const;

// `onColour`: the white wordmark with the yellow speech bubble and sparks, for the blue top bar (it vanishes on white).
const ART = {
  default: { src: '/brand/howdy-wordmark.png', width: 728, height: 224 },
  onColour: { src: '/brand/howdy-logo-sparks.png', width: 658, height: 224 },
} as const;

/** The Howdy wordmark (the brand artwork). Links to the Gate unless told otherwise (signed-in pages point it at Home). */
export function HowdyLogo({
  size = 'sm',
  href = '/gate',
  tone = 'default',
  className,
}: {
  size?: keyof typeof LOGO_HEIGHT;
  href?: string;
  tone?: keyof typeof ART;
  className?: string;
}) {
  const art = ART[tone];
  return (
    // min-h-11: the small top-bar logo is only ~35 px tall, and a link must be at least 44 px to tap.
    <Link
      href={href}
      className={cn('inline-flex min-h-11 items-center no-underline hover:no-underline', className)}
    >
      <Img
        src={art.src}
        width={art.width}
        height={art.height}
        alt="Howdy"
        loading="eager"
        className={cn('w-auto', LOGO_HEIGHT[size])}
      />
    </Link>
  );
}
