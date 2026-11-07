/* eslint-disable @next/next/no-img-element -- next/og draws plain <img> (data URLs); next/image cannot run there */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

/**
 * The card a shared link shows on WhatsApp, Instagram, X and the rest: the promise, in Howdy's colours. /welcome uses it
 * as it is; an invite link (ADR-045) puts "<Name> invited you to Howdy" in the line above the promise.
 */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 };

// The palette's own values (an image has no CSS tokens to read).
const SURFACE = '#ffffff';
const INK = '#100b00';
const SLATE = '#4a4540';
const PRIMARY_SOFT = '#fef6d8';
// The primary button: Sunflower with Royal Navy on it, like every primary button in the app.
const PRIMARY = '#f8cf35';
const ON_PRIMARY = '#2b3278';

const font = (file: string) => readFile(path.join(process.cwd(), 'assets', 'fonts', file));

async function art(file: string): Promise<string> {
  const bytes = await readFile(path.join(process.cwd(), 'public', file));
  return `data:image/${file.endsWith('.svg') ? 'svg+xml' : 'png'};base64,${bytes.toString('base64')}`;
}

export async function shareCard(
  kicker: string = 'Social media for people you actually know',
): Promise<ImageResponse> {
  const [logo, art_] = await Promise.all(
    ['brand/howdy-wordmark.png', 'illustrations/welcome-hero-card.png'].map(art),
  );
  const [fraunces, googleSans] = await Promise.all([font('fraunces-600.ttf'), font('google-sans-500.ttf')]);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '64px 80px',
        background: SURFACE,
        position: 'relative',
        fontFamily: 'Google Sans',
      }}
    >
      {/* The welcome page's illustration (Magnific, credited on the page) over a light sunflower sun. */}
      <div
        style={{
          position: 'absolute',
          right: 70,
          top: 70,
          width: 400,
          height: 400,
          borderRadius: 999,
          background: PRIMARY_SOFT,
        }}
      />
      <img
        src={art_}
        width={448}
        height={520}
        style={{ position: 'absolute', right: 40, bottom: 30 }}
        alt=""
      />
      <img src={logo} width={260} height={80} alt="" />
      <div style={{ display: 'flex', marginTop: 24, color: SLATE, fontSize: 28 }}>{kicker}</div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 14,
          color: INK,
          fontFamily: 'Fraunces',
          fontSize: 76,
          fontWeight: 600,
          lineHeight: 1.08,
        }}
      >
        <span>Stay close</span>
        <span style={{ display: 'flex', color: ON_PRIMARY }}>to your people.</span>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 30,
          alignSelf: 'flex-start',
          background: PRIMARY,
          color: ON_PRIMARY,
          fontSize: 28,
          fontWeight: 500,
          padding: '14px 32px',
          borderRadius: 999,
        }}
      >
        Sign up — it’s free
      </div>
    </div>,
    {
      ...SHARE_CARD_SIZE,
      fonts: [
        { name: 'Fraunces', data: fraunces, weight: 600, style: 'normal' },
        { name: 'Google Sans', data: googleSans, weight: 500, style: 'normal' },
      ],
    },
  );
}
