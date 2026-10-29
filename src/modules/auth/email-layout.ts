import { getEnv } from '@/platform/config/env';
import type { MailMessage } from '@/platform/mailer';

/**
 * The one look every Howdy email shares: a violet header with the white wordmark, a white card, the palette's ink and
 * violet. Each message is described once (heading, paragraphs, an optional code and button) and rendered twice: as HTML
 * (tables and inline styles, which is what Gmail, Outlook and Apple Mail all understand) and as the plain-text copy
 * that always travels with it. Nothing remote is loaded but the logo, and there is no tracking of any kind.
 */

/** A run of words, or a link inside a sentence. */
export type Segment = string | { href: string; label: string };
/** One paragraph. */
export type Paragraph = string | Segment[];

export interface EmailContent {
  subject: string;
  /** The grey line mail apps show after the subject in the inbox. */
  preheader?: string;
  heading: string;
  intro: Paragraph[];
  /** A one-time code, shown big and spaced ("482 913"). */
  code?: string;
  button?: { label: string; href: string };
  /** Smaller print under the button: expiry, "if this was not you". */
  after?: Paragraph[];
}

// The palette (tokens.css), repeated here because email cannot read CSS variables.
const VIOLET = '#260959';
const INK = '#100b00';
const SLATE = '#4a4540';
const MUTED = '#5e5850';
const PAGE = '#f8f7ff';
const VIOLET_SOFT = '#ebe6f8';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An absolute link on our own site. */
export function siteLink(path: string, params?: Record<string, string>): string {
  const url = new URL(path, getEnv().APP_URL);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  return url.toString();
}

/** "482913" → "482 913": easier to read off one screen and type on another. */
export const spacedCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

const segments = (p: Paragraph): Segment[] => (typeof p === 'string' ? [p] : p);

function paragraphHtml(p: Paragraph, size: number, color: string): string {
  const inner = segments(p)
    .map((s) =>
      typeof s === 'string'
        ? escape(s)
        : `<a href="${escape(s.href)}" style="color:${VIOLET};font-weight:600;text-decoration:underline">${escape(s.label)}</a>`,
    )
    .join('');
  return `<p style="margin:0 0 14px;font-size:${size}px;line-height:1.55;color:${color}">${inner}</p>`;
}

const paragraphText = (p: Paragraph) =>
  segments(p)
    .map((s) => (typeof s === 'string' ? s : `${s.label} (${s.href})`))
    .join('');

function renderText(c: EmailContent): string {
  return [
    c.heading,
    '',
    ...c.intro.map(paragraphText),
    ...(c.code ? ['', `Your code: ${spacedCode(c.code)}`] : []),
    ...(c.button ? ['', `${c.button.label}: ${c.button.href}`] : []),
    ...(c.after?.length ? ['', ...c.after.map(paragraphText)] : []),
    '',
    '— Howdy',
  ].join('\n');
}

function renderHtml(c: EmailContent): string {
  const logo = siteLink('/brand/howdy-wordmark-white.png');
  const code = c.code
    ? `<div style="margin:6px 0 20px;padding:14px 0;border-radius:8px;background:${VIOLET_SOFT};text-align:center;font-size:32px;font-weight:700;letter-spacing:6px;color:${VIOLET};font-variant-numeric:tabular-nums">${escape(spacedCode(c.code))}</div>`
    : '';
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 20px"><tr><td align="center" bgcolor="${VIOLET}" style="border-radius:8px"><a href="${escape(c.button.href)}" style="display:block;padding:14px 24px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px">${escape(c.button.label)}</a></td></tr></table>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escape(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escape(c.preheader ?? '')}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${PAGE}" style="background:${PAGE}"><tr><td align="center" style="padding:24px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e3e0f0">
<tr><td align="center" bgcolor="${VIOLET}" style="background:${VIOLET};padding:24px 16px"><img src="${escape(logo)}" width="120" height="37" alt="Howdy" style="display:block;border:0;width:120px;height:37px;color:#ffffff;font-size:24px;font-weight:700"></td></tr>
<tr><td style="padding:28px 28px 12px;font-family:${FONT}">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;font-weight:700;color:${INK}">${escape(c.heading)}</h1>
${c.intro.map((p) => paragraphHtml(p, 15, SLATE)).join('\n')}
${code}
${button}
${(c.after ?? []).map((p) => paragraphHtml(p, 13, MUTED)).join('\n')}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:${MUTED};font-family:${FONT}">Howdy · <a href="${escape(siteLink('/'))}" style="color:${MUTED}">${escape(new URL(getEnv().APP_URL).host)}</a></p>
</td></tr></table>
</body></html>`;
}

export function composeEmail(to: string, content: EmailContent): MailMessage {
  return { to, subject: content.subject, text: renderText(content), html: renderHtml(content) };
}
