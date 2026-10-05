import { getEnv } from '@/platform/config/env';
import type { MailMessage } from '@/platform/mailer';

/** Plain-text transactional emails. Links always go to APP_URL; tokens are single-use and expire (see config). */
const link = (path: string, token?: string) => {
  const url = new URL(path, getEnv().APP_URL);
  if (token) url.searchParams.set('token', token);
  return url.toString();
};

export function verifyEmailMessage(to: string, token: string): MailMessage {
  return {
    to,
    subject: 'Confirm your email to get your Howdy deed',
    text: [
      'Howdy!',
      '',
      'Confirm your email to finish staking your claim:',
      link('/verify', token),
      '',
      'This link works once and expires in 24 hours.',
      'If you did not sign up for Howdy, you can ignore this email.',
    ].join('\n'),
  };
}

/** Sent instead of a second account when someone signs up with an email that is already registered. */
export function alreadyRegisteredMessage(to: string): MailMessage {
  return {
    to,
    subject: 'You already have a Howdy account',
    text: [
      'Howdy!',
      '',
      'Someone (hopefully you) tried to sign up with this email, but it already has a Howdy account.',
      '',
      `Step inside: ${link('/step-inside')}`,
      `Lost your key? ${link('/lost-your-key')}`,
      '',
      'If this was not you, you can ignore this email. Nothing has changed.',
    ].join('\n'),
  };
}

export function passwordResetMessage(to: string, token: string): MailMessage {
  return {
    to,
    subject: 'Reset your Howdy password',
    text: [
      'Howdy!',
      '',
      'Use this link to choose a new password:',
      link('/lost-your-key/reset', token),
      '',
      'This link works once and expires in 1 hour.',
      'If you did not ask for this, ignore this email. Your password has not changed.',
    ].join('\n'),
  };
}

export function passwordChangedMessage(to: string): MailMessage {
  return {
    to,
    subject: 'Your Howdy password was changed',
    text: [
      'Howdy!',
      '',
      'Your password was just changed and every device was signed out.',
      `If this was not you, reset it right away: ${link('/lost-your-key')}`,
    ].join('\n'),
  };
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Sent when someone asks to delete their account: when it goes, and how to keep it (ADR-027). */
export function deletionScheduledMessage(to: string, deleteOn: Date): MailMessage {
  return {
    to,
    subject: 'Your Howdy account will be deleted',
    text: [
      'Howdy.',
      '',
      `You asked us to delete your Howdy account. It is closed now, and on ${longDate(deleteOn)} it will be deleted for good,`,
      'with your Porch, Post Cards, Whispers, Pals and photo.',
      '',
      `Changed your mind? Step inside before then and choose "Keep my account": ${link('/step-inside')}`,
      '',
      'If this was not you, step inside and keep your account, then change your password right away.',
    ].join('\n'),
  };
}

/** Sent once the account is gone. */
export function accountDeletedMessage(to: string): MailMessage {
  return {
    to,
    subject: 'Your Howdy account has been deleted',
    text: [
      'Howdy.',
      '',
      'Your Howdy account has now been deleted, as you asked. Thank you for spending time on the porch.',
      '',
      'We keep only what our Privacy Policy describes (for example, reports about your account, with your name removed).',
      `You are welcome back any time: ${link('/stake-a-claim')}`,
    ].join('\n'),
  };
}

/**
 * Every change to how an account signs in is told to its owner by email (ADR-040), so a change they did not make is
 * noticed. No codes, keys or device secrets are ever in it.
 */
export type TwoStepChange =
  | 'turned_on'
  | 'turned_off'
  | 'passkey_added'
  | 'passkey_removed'
  | 'app_added'
  | 'app_removed'
  | 'recovery_codes_renewed'
  | 'recovery_code_used';

const TWO_STEP_LINES: Record<TwoStepChange, { subject: string; line: string }> = {
  turned_on: {
    subject: 'Two-step sign-in is on',
    line: 'Two-step sign-in is now on for your Howdy account. Every other device was signed out.',
  },
  turned_off: {
    subject: 'Two-step sign-in is off',
    line: 'Two-step sign-in is now off for your Howdy account: your password alone signs in again.',
  },
  passkey_added: { subject: 'A passkey was added', line: 'A new passkey was added to your Howdy account.' },
  passkey_removed: {
    subject: 'A passkey was removed',
    line: 'A passkey was removed from your Howdy account.',
  },
  app_added: {
    subject: 'An authenticator app was linked',
    line: 'An authenticator app was linked to your Howdy account.',
  },
  app_removed: {
    subject: 'Your authenticator app was unlinked',
    line: 'The authenticator app was unlinked from your Howdy account.',
  },
  recovery_codes_renewed: {
    subject: 'New recovery codes',
    line: 'New recovery codes were made for your Howdy account. The old ones no longer work.',
  },
  recovery_code_used: {
    subject: 'A recovery code was used',
    line: 'A recovery code was just used to sign in to your Howdy account.',
  },
};

export function twoStepChangedMessage(to: string, change: TwoStepChange, extra?: string): MailMessage {
  const { subject, line } = TWO_STEP_LINES[change];
  return {
    to,
    subject,
    text: [
      'Howdy!',
      '',
      line,
      ...(extra ? [extra] : []),
      '',
      `If this was you, there is nothing to do. If it was not, reset your password now: ${link('/lost-your-key')}`,
      'and then check "Sign-in security" in your Workshop.',
    ].join('\n'),
  };
}
