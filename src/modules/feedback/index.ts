/** Feedback about Howdy itself (ADR-059). */
export {
  listFeedback,
  myFeedback,
  purgeOldFeedback,
  sendFeedback,
  setFeedbackStatus,
  FEEDBACK_RETENTION_DAYS,
  RATE,
} from './service';
export type { FeedbackItem } from './service';
