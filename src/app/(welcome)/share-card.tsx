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
const CREAM = '#f8f7ff';
const INK = '#100b00';
const SLATE = '#4a4540';
const ACCENT_STRONG = '#1a063f';
const ACCENT_SOFT = '#ebe6f8';
const ON_ACCENT = '#ffffff';

const font = (file: string) => readFile(path.join(process.cwd(), 'assets', 'fonts', file));

async function art(file: string): Promise<string> {
  const bytes = await readFile(path.join(process.cwd(), 'public', file));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

export async function shareCard(kicker: string = 'A small-circle social world'): Promise<ImageResponse> {
  const [logo, hat, sun, cloud, gem, yo] = await Promise.all(
    [
      'brand/howdy-wordmark.png',
      'art/hat.png',
      'art/sun.png',
      'art/cloud.png',
      'art/mark-gem.png',
      'art/react-yo.png',
    ].map(art),
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
        padding: '72px 80px',
        background: CREAM,
        position: 'relative',
        fontFamily: 'Google Sans',
      }}
    >
      <img src={sun} width={150} height={122} style={{ position: 'absolute', top: 48, right: 90 }} alt="" />
      <img
        src={cloud}
        width={130}
        height={131}
        style={{ position: 'absolute', top: 210, right: 300 }}
        alt=""
      />
      <img
        src={gem}
        width={120}
        height={120}
        style={{ position: 'absolute', bottom: 70, right: 110 }}
        alt=""
      />
      <img src={yo} width={96} height={96} style={{ position: 'absolute', top: 64, right: 300 }} alt="" />
      <img src={logo} width={300} height={92} alt="" />
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 28, color: SLATE, fontSize: 30 }}
      >
        <img src={hat} width={52} height={40} alt="" />
        {kicker}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 18,
          color: INK,
          fontFamily: 'Fraunces',
          fontSize: 86,
          fontWeight: 600,
          lineHeight: 1.05,
        }}
      >
        <span>Your people.</span>
        <span
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            background: ACCENT_SOFT,
            borderRadius: 24,
            padding: '0 18px',
            marginLeft: -18,
          }}
        >
          Not the whole internet.
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 36,
          alignSelf: 'flex-start',
          background: ACCENT_STRONG,
          color: ON_ACCENT,
          fontSize: 30,
          fontWeight: 500,
          padding: '16px 34px',
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
