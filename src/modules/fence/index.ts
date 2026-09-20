/**
 * Public surface of the fence module: Post Cards, replies and Yo on a Ranch's public wall. It depends on `authz` (the one
 * policy), `profiles` (who is active, the Fence's settings, names) and `relationships` (block / mute / restrict). It never
 * exposes user ids or privacy settings — only what a reader is allowed to see.
 */
export {
  approveCard,
  approveReply,
  cardForReport,
  listFence,
  listWaiting,
  postCard,
  postReply,
  purgeStaleWaiting,
  removeCard,
  removeReply,
  setYo,
} from './service';
export type {
  AuthorRef,
  CardView,
  FencePage,
  ReplyView,
  Waiting,
  WaitingCard,
  WaitingReply,
} from './service';
