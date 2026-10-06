'use client';

import { useState } from 'react';
import { buttonClasses } from '@/ui/primitives';

/** Share the welcome page: the phone's own share sheet where there is one, otherwise copy the link. */
export function ShareButton({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/welcome`;
    const data = { title: 'Howdy', text: 'Your people. Not the whole internet. Come sit on the porch.', url };
    try {
      if (navigator.share) return await navigator.share(data);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Dismissing the share sheet is not an error worth showing.
    }
  }

  return (
    <button type="button" onClick={share} className={buttonClasses({ variant, size: 'lg' })}>
      <span aria-live="polite">{copied ? 'Link copied!' : 'Share Howdy'}</span>
    </button>
  );
}
