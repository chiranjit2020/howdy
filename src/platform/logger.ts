import pino, { type Logger } from 'pino';

/** Anything matching these paths is replaced with [redacted] before it is written. */
export const REDACT_PATHS = [
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'sessionToken',
  'resetToken',
  'verificationToken',
  'authorization',
  'cookie',
  'set-cookie',
  'body', // Whisper / Post Card bodies are private content — never log them
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.token',
  '*.sessionToken',
  '*.authorization',
  '*.cookie',
  '*.set-cookie',
  '*.body',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createLogger(opts: { level?: string; destination?: pino.DestinationStream } = {}): Logger {
  const level = opts.level ?? process.env.LOG_LEVEL ?? 'info';
  const config: pino.LoggerOptions = {
    level,
    base: { service: 'howdy' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: { level: (label) => ({ severity: label }) },
  };
  return opts.destination ? pino(config, opts.destination) : pino(config);
}

export const logger = createLogger();
