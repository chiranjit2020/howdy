import type { AskView } from '@/modules/asks';
import { attachPortraits } from './social';

/** Everyone a list of questions shows (askers and answerers), for their photos. */
export const peopleOnAsks = (asks: AskView[]) =>
  asks.flatMap((a) => [a.author, ...a.answers.map((x) => x.author)]);

/** Photos for the askers and answerers, when the viewer is signed in (attachPortraits skips signed-out viewers). */
export const withAskPortraits = (viewerId: string | undefined, asks: AskView[]) =>
  attachPortraits(viewerId, peopleOnAsks(asks));
