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
    subject: 'Reset your Howdy secret knock',
    text: [
      'Howdy!',
      '',
      'Use this link to choose a new secret knock:',
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
    subject: 'Your Howdy secret knock was changed',
    text: [
      'Howdy!',
      '',
      'Your secret knock was just changed and every device was signed out.',
      `If this was not you, reset it right away: ${link('/lost-your-key')}`,
    ].join('\n'),
  };
}
