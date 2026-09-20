import Link from 'next/link';
import type { ReactNode } from 'react';

/** Shared frame for the signed-out pages: a centred column with the Howdy mark. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      {/* A banner landmark, so every element on the page lives inside a landmark. */}
      <header className="flex justify-center">
        <Link
          href="/gate"
          className="inline-flex min-h-11 items-center font-display text-display text-text-primary no-underline"
        >
          Howdy
        </Link>
      </header>
      <main id="main" className="flex flex-col gap-6">
        {children}
      </main>
    </div>
  );
}
