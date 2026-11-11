import type { ReactNode } from 'react';
import { Img } from '@/ui/art/img';
import { HowdyLogo } from '@/ui/logo';

/**
 * Log in and Create account (2026-11-08, the user's pick of the mockups, "Option 4"): a split screen from lg up. The
 * left half is the top bar's blue with the big logo, one line and the friends illustration; the right half is the
 * card. Below lg there is no room for two halves, so the blue half goes and the card carries a blue band instead.
 *
 * The illustration loads lazily on purpose: on phones its half is hidden, and a hidden lazy image is never fetched.
 * Only a headline sits on the blue: white on the header blue is about 3.6:1, enough for large words, too little for small ones.
 */
export function AuthSplit({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="min-h-dvh lg:grid lg:grid-cols-2">
      <section
        aria-label="About Howdy"
        className="hidden bg-header lg:flex lg:flex-col lg:justify-center lg:gap-8 lg:px-12 lg:py-10 xl:px-16"
      >
        <HowdyLogo tone="onColour" size="hero" priority className="-ml-1 self-start" />
        <h2 className="max-w-[15ch] text-display text-balance text-on-header">
          Say howdy to the people you know.
        </h2>
        <Img
          src="/illustrations/friends-phone-1280.webp"
          srcSet="/illustrations/friends-phone-720.webp 720w, /illustrations/friends-phone-1280.webp 1280w"
          sizes="(min-width: 75rem) 40vw, 45vw"
          width={1280}
          height={720}
          alt="Five friends laughing together at something on one phone"
          className="h-auto w-full max-w-[40rem] rounded-card"
        />
      </section>
      <div className="mx-auto flex min-h-dvh w-full max-w-[29rem] flex-col justify-center px-2 py-4 sm:max-w-[30rem] sm:px-4 lg:max-w-none lg:items-center lg:px-12">
        <div className="w-full lg:max-w-md">{children}</div>
      </div>
    </main>
  );
}
