import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getEnv } from '../config/env';
import { AppError } from '../errors';
import { logger } from '../logger';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text only: no HTML, no tracking pixels. */
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Collects messages in memory. For tests. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
  /** The most recent message to `to`, or undefined. */
  lastTo(to: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === to);
  }
}

/** Dev only: prints the message (it contains a secret link, so never use in production). */
class ConsoleMailer implements Mailer {
  async send(message: MailMessage): Promise<void> {
    // Logged at info on purpose so a developer can click the link; the logger's redaction does not touch message text.
    logger.info({ event: 'mail.console', to: message.to, subject: message.subject, mailText: message.text });
  }
}

/** Dev/e2e: one JSON file per message so a test can read the link. */
class FileMailer implements Mailer {
  constructor(private readonly dir: string) {}
  async send(message: MailMessage): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const name = `${Date.now()}-${randomUUID()}.json`;
    await writeFile(join(this.dir, name), JSON.stringify(message, null, 2), 'utf8');
  }
}

let mailer: Mailer | undefined;

/** For tests. */
export function setMailer(next: Mailer | undefined): void {
  mailer = next;
}

/**
 * Returns the configured mailer. There is no production provider yet, so production refuses to send rather than
 * silently dropping (or logging) verification and reset links. Wire a real provider here before deploying.
 */
export function getMailer(): Mailer {
  if (mailer) return mailer;
  const env = getEnv();
  if (env.NODE_ENV === 'production' && env.ENABLE_TEST_MAILER !== '1') {
    throw new AppError('INTERNAL', { cause: new Error('No production mail provider is configured') });
  }
  mailer = env.MAIL_TRANSPORT === 'file' ? new FileMailer(env.MAIL_OUTBOX_DIR) : new ConsoleMailer();
  return mailer;
}
