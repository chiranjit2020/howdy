import { shareCard, SHARE_CARD_SIZE } from './(welcome)/share-card';

/** The card any Howdy link shows when its page has no card of its own (the welcome page and invites have theirs). */
export const alt = 'Howdy — stay close to your people.';
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return shareCard();
}
