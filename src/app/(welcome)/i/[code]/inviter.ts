import { cache } from 'react';
import { inviterName } from '@/modules/invites';
import { logger } from '@/platform/logger';

/**
 * Who sent an invite link, for its page, title and share card. If the database cannot be reached (a slow wake-up after
 * a quiet night), the lookup gives `undefined` and the page still opens: just without the name. The invite code still
 * goes to sign-up, which checks it again for itself. `null` means the link does not work. Cached so the page and its
 * title share one lookup.
 */
export const lookUpInviter = cache(async (code: string): Promise<string | null | undefined> => {
  try {
    return await inviterName(code);
  } catch (err) {
    logger.warn({ event: 'invite.inviter_lookup_failed', err });
    return undefined;
  }
});
