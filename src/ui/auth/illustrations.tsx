import { Img } from '../art/img';
import { Blob } from './blob';

/** The cactus, fence and sandy rise in the bottom-left of the Step Inside card. Decorative, so it has no alt text. */
export function TrailArt() {
  return (
    <Img
      src="/art/trail-scene.png"
      width={268}
      height={199}
      alt=""
      loading="eager"
      className="h-auto w-40 sm:w-52"
    />
  );
}

/** The little homestead in the top-right of the Stake a Claim card. Decorative, so it has no alt text. */
export function RanchArt() {
  return (
    <Img
      src="/art/ranch-scene.png"
      width={291}
      height={230}
      alt=""
      loading="eager"
      className="h-auto w-40 sm:w-56"
    />
  );
}

/**
 * The sign-in page background: a soft top-to-bottom cream gradient with three organic SVG blobs (top-left, right-centre,
 * bottom-left). `fixed` and behind everything, so the card floats on top. It paints its own colour, so the rest of the
 * app keeps its own background.
 */
export function AuthBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-linear-to-b from-auth-page-from to-auth-page-to"
    >
      <Blob shape={1} className="-top-32 -left-28 size-[24rem] rotate-[200deg] fill-auth-blob-peach" />
      <Blob shape={3} className="top-[14%] -right-36 size-[28rem] rotate-[160deg] fill-auth-blob-sky" />
      <Blob shape={2} className="-bottom-32 -left-28 size-[26rem] rotate-6 fill-auth-blob-mint" />
    </div>
  );
}
