import Link from 'next/link';
import type { ReactNode } from 'react';
import { Img } from '../art/img';
import { cn } from '../cn';
import { Blob } from './blob';

const LOGO_WIDTH = { lg: 'w-68', sm: 'w-36', xs: 'w-24' } as const;

/**
 * The Howdy wordmark (the brand artwork). `lg` is the Step Inside size, `sm` the other sign-in pages, `xs` the app's top
 * bar. Links to the Gate unless told otherwise (signed-in pages point it at Home).
 */
export function HowdyLogo({
  size = 'lg',
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
        width={274}
        height={101}
        alt="Howdy"
        loading="eager"
        className={cn('h-auto', LOGO_WIDTH[size])}
      />
    </Link>
  );
}

/**
 * The frame for every signed-out page: a big soft card with the wordmark and your content.
 * `scene="trail"` (Step Inside) puts a peach blob in the bottom-right and reserves the bottom-left corner for artwork;
 * `scene="ranch"` (Stake a Claim) puts a lilac blob bottom-left, a seafoam blob bottom-right, and reserves the top-right.
 * Pass `art` (an image or SVG, sized by its own width classes) to fill the reserved corner. The card clips it, so nothing
 * ever spills past the rounded corners.
 */
export function AuthCard({
  scene,
  art,
  logo = 'sm',
  children,
  className,
}: {
  scene?: 'trail' | 'ranch';
  art?: ReactNode;
  logo?: 'lg' | 'sm';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-field-border/60 bg-auth-card shadow-auth-card">
      {scene === 'trail' && (
        <>
          <Blob shape={3} className="-right-14 -bottom-16 size-52 -rotate-12 fill-auth-blob-peach" />
          {art && <div className="pointer-events-none absolute bottom-0 left-0">{art}</div>}
        </>
      )}
      {scene === 'ranch' && (
        <>
          <Blob shape={0} className="-bottom-16 -left-16 size-48 rotate-12 fill-auth-blob-lilac" />
          <Blob shape={2} className="-right-16 -bottom-16 size-48 -rotate-6 fill-auth-blob-seafoam" />
          {art && <div className="pointer-events-none absolute top-3 right-2">{art}</div>}
        </>
      )}
      <div className={cn('relative z-10 flex flex-col gap-6 px-6 py-10 sm:px-10', className)}>
        <div>
          <HowdyLogo size={logo} />
        </div>
        {children}
      </div>
    </div>
  );
}
