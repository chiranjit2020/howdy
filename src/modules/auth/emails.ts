import type { MailMessage } from '@/platform/mailer';
import { composeEmail, siteLink, spacedCode, type Paragraph } from './email-layout';

/** Transactional emails, all in the shared layout (email-layout.ts). Links always go to APP_URL; tokens are single-use. */

const NOT_YOU_SIGNUP =
  'If you did not sign up for Howdy, ignore this email: nothing can be used until it is confirmed.';
/** Read when an email is built, never at import (settings are only checked at run time). */
const reset = () => siteLink('/forgot-password');

/**
 * Confirm the email: a 6-digit code to type on the page that is still open (it works for 15 minutes), and a button for
 * whoever reads this on the same device (the link works for 24 hours). Names the username, so a person can tell which
 * account they are confirming.
 */
export function verifyEmailMessage(to: string, token: string, handle: string, code: string): MailMessage {
  return composeEmail(to, {
    subject: `${spacedCode(code)} is your Howdy code`,
    preheader: `Confirm your email for @${handle}.`,
    heading: 'Confirm your email',
    intro: [`Enter this code on Howdy to finish creating @${handle}:`],
    code,
    button: { label: 'Verify account', href: siteLink('/verify', { token }) },
    after: ['The code works for 15 minutes; the button for 24 hours. Each works once.', NOT_YOU_SIGNUP],
  });
}

/** Sent instead of a second account when someone signs up with an email that is already registered. */
export function alreadyRegisteredMessage(to: string): MailMessage {
  return composeEmail(to, {
    subject: 'You already have a Howdy account',
    preheader: 'Log in instead, or reset your password.',
    heading: 'You already have an account',
    intro: ['Someone (hopefully you) tried to sign up with this email, but it already has a Howdy account.'],
    button: { label: 'Log in', href: siteLink('/login') },
    after: [
      ['Forgot your password? ', { href: reset(), label: 'Reset it' }, '.'],
      'If this was not you, ignore this email. Nothing has changed.',
    ],
  });
}

export function passwordResetMessage(to: string, token: string): MailMessage {
  return composeEmail(to, {
    subject: 'Reset your Howdy password',
    preheader: 'Choose a new password. The link works for 1 hour.',
    heading: 'Reset your password',
    intro: ['Tap the button to choose a new password.'],
    button: { label: 'Choose a new password', href: siteLink('/forgot-password/reset', { token }) },
    after: [
      'This link works once and expires in 1 hour.',
      'If you did not ask for this, ignore this email. Your password has not changed.',
    ],
  });
}

export function passwordChangedMessage(to: string): MailMessage {
  return composeEmail(to, {
    subject: 'Your Howdy password was changed',
    preheader: 'Every device was signed out.',
    heading: 'Your password was changed',
    intro: ['Your password was just changed and every device was signed out.'],
    after: [['If this was not you, ', { href: reset(), label: 'reset it right away' }, '.']],
  });
}

const longDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Sent when someone asks to delete their account: when it goes, and how to keep it (ADR-027). */
export function deletionScheduledMessage(to: string, deleteOn: Date): MailMessage {
  return composeEmail(to, {
    subject: 'Your Howdy account will be deleted',
    preheader: `It will be deleted on ${longDate(deleteOn)}.`,
    heading: 'Your account will be deleted',
    intro: [
      `You asked us to delete your Howdy account. It is closed now, and on ${longDate(deleteOn)} it will be deleted for good, with your profile, posts, messages, friends and photo.`,
      'Changed your mind? Log in before then and choose “Keep my account”.',
    ],
    button: { label: 'Log in', href: siteLink('/login') },
    after: ['If this was not you, log in and keep your account, then change your password right away.'],
  });
}

/** Sent once the account is gone. */
export function accountDeletedMessage(to: string): MailMessage {
  return composeEmail(to, {
    subject: 'Your Howdy account has been deleted',
    heading: 'Your account has been deleted',
    intro: [
      'Your Howdy account has now been deleted, as you asked. Thank you for spending time on Howdy.',
      'We keep only what our Privacy Policy describes (for example, reports about your account, with your name removed).',
    ],
    after: [
      ['You are welcome back any time: ', { href: siteLink('/signup'), label: 'create an account' }, '.'],
    ],
  });
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
  const after: Paragraph[] = [
    [
      'If this was you, there is nothing to do. If it was not, ',
      { href: reset(), label: 'reset your password now' },
      ', then check “Sign-in security” in your Settings.',
    ],
  ];
  return composeEmail(to, {
    subject,
    heading: subject,
    intro: [line, ...(extra ? [extra] : [])],
    after,
  });
}
