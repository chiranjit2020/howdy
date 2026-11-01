import { shareCard, SHARE_CARD_SIZE } from '../share-card';

/** The card a shared /welcome link shows. */
export const alt = 'Howdy — stay close to your people.';
export const size = SHARE_CARD_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return shareCard();
}
