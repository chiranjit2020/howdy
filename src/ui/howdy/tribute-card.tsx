import type { ReactNode } from 'react';
import { Glyph } from '../art/glyph';
import { cn } from '../cn';
import { Badge } from '../primitives/badge';

export interface TributeCardProps {
  body: string;
  authorHandle: string;
  /** Tributes need the Ranch owner's approval before they appear publicly. */
  status: 'published' | 'pending';
  pinned?: boolean;
  /** Approve / Decline buttons for the owner while pending. */
  actions?: ReactNode;
}

/** A Tribute: a friend's public testimonial, set in the display serif on a parchment tint. */
export function TributeCard({ body, authorHandle, status, pinned, actions }: TributeCardProps) {
  return (
    <figure
      className={cn('clay flex flex-col gap-3 bg-tribute p-5', status === 'pending' && 'border-dashed')}
    >
      <div className="flex flex-wrap gap-2">
        {pinned && (
          <Badge tone="warning">
            <Glyph emoji="📜" className="mr-1" />
            Pinned Tribute
          </Badge>
        )}
        {status === 'pending' && <Badge tone="info">Waiting for your approval</Badge>}
      </div>
      <blockquote className="font-display text-title break-words text-text-primary italic">
        “{body}”
      </blockquote>
      <figcaption className="text-caption text-text-secondary">— @{authorHandle}</figcaption>
      {status === 'pending' && actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </figure>
  );
}
