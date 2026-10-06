import { inviterName } from '@/modules/invites';
import { shareCard, SHARE_CARD_SIZE } from '../../share-card';

/** The card an invite link shows: "<Name> invited you to Howdy" — the display name only (ADR-045). */
export const alt = 'An invitation to Howdy — your people, not the whole internet.';
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const name = await inviterName((await params).code);
  if (!name) return shareCard();
  // The card's font covers Latin letters only (printable ASCII and Latin-1): a name in another script, or with emoji,
  // would draw as blanks, so it is left out rather than shown broken. Long names are shortened to keep to one line.
  const drawable = /^[\x20-\x7E\u00A0-\u00FF]+$/.test(name);
  const short = name.length > 22 ? `${name.slice(0, 21)}…` : name;
  return shareCard(drawable ? `${short} invited you to Howdy` : 'You’re invited to Howdy');
}
