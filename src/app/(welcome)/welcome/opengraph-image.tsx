import { shareCard, SHARE_CARD_SIZE } from '../share-card';

/** The card a shared /welcome link shows. */
export const alt = 'Howdy — your people, not the whole internet.';
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return shareCard();
}
