import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Art, type ArtName } from '@/ui/art/glyph';
import { Img } from '@/ui/art/img';
import { cn } from '@/ui/cn';
import { buttonClasses } from '@/ui/primitives';
import { ShareButton } from './share-button';

const TITLE = 'Howdy — your people, not the whole internet';
const DESCRIPTION =
  'A small-circle social world: postcards on your fence, quiet porch visits and private whispers. No endless feed. No follower counts.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website', siteName: 'Howdy' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/** The soft clay tints the app uses for its tiles, in turn. */
const TINTS = ['bg-accent-soft', 'bg-success', 'bg-warning', 'bg-info', 'bg-mystery'] as const;

const FEATURES: { art: ArtName; name: string; text: string }[] = [
  {
    art: 'nav-porch',
    name: 'Your Porch',
    text: 'Your corner of Howdy: a portrait, a few words about you, and a Signal that fades after 12 hours.',
  },
  {
    art: 'nav-pals',
    name: 'Pals',
    text: 'Friends both ways, never followers. Star your Close Pals, and meet Pals you may know.',
  },
  {
    art: 'nav-nail',
    name: 'Post Cards',
    text: 'Nail a short card (and a photo) to a Pal’s Fence. React with a Yo, Laugh, Fire, Popcorn or Love.',
  },
  {
    art: 'nav-whispers',
    name: 'Whispers',
    text: 'Private messages that arrive instantly. “Seen” only if you both want it. Burn a thread any time.',
  },
  {
    art: 'nav-tracks',
    name: 'Tracks',
    text: 'See who dropped by your Porch — or go on a Shadow Walk and leave no footprints (yours pause too).',
  },
  {
    art: 'mark-gem',
    name: 'Tributes & Marks',
    text: 'Kind words you approve before they show, and five Marks — Gem, Pure, Chill, Sharp, Bold — from Pals and Town Hall neighbours.',
  },
  {
    art: 'nav-town-halls',
    name: 'Town Halls',
    text: 'Small communities with their own feed, Deputies who keep order, and “ask to join” when you want it.',
  },
  {
    art: 'nav-capsules',
    name: 'Time Capsules',
    text: 'Seal words for future you, a Pal or a whole Town Hall. Nobody can read them early — not even you.',
  },
  {
    art: 'nav-chimes',
    name: 'Chimes',
    text: 'Gentle notifications, on your phone too. “On this day” Memories bring back the good bits.',
  },
];

const SAFETY: { art: ArtName; text: string }[] = [
  { art: 'rule-respect-the-campfire', text: 'Campfire Rules that everyone agrees to before they step in' },
  { art: 'rule-respect-boundaries', text: 'Block, restrict and report — quietly. A “no” is never announced' },
  { art: 'rule-keep-it-safe-and-legal', text: 'Passkeys and two-step sign-in to keep your account yours' },
  { art: 'camera', text: 'Photos are checked before they reach anyone' },
  { art: 'rule-look-after-each-other', text: 'Download everything you have shared, any time' },
  { art: 'rule-no-spam', text: 'No ads, no tracking, and your data is never sold' },
];

const AHEAD: { name: string; text: string; tag: string }[] = [
  {
    tag: 'Planned',
    name: 'Even stronger photo safety',
    text: 'An extra layer of scanning for the worst kinds of images, on top of the checks every photo gets today.',
  },
  {
    tag: 'Next',
    name: 'More circles',
    text: 'Opening Howdy to more campuses and communities, one small circle at a time.',
  },
];

function Section({
  id,
  kicker,
  title,
  children,
}: {
  id?: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id ?? kicker}-title`}
      className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-14 sm:px-6 sm:py-20"
    >
      <p className="font-mono text-metadata tracking-widest text-text-muted uppercase">{kicker}</p>
      <h2
        id={`${id ?? kicker}-title`}
        className="mt-2 max-w-2xl font-display text-[clamp(1.75rem,1.2rem+2.2vw,2.75rem)] leading-tight font-semibold text-text-primary"
      >
        {title}
      </h2>
      <div className="mt-8 sm:mt-10">{children}</div>
    </section>
  );
}

/** A peek at the app, built from the same clay pieces it uses: a Post Card, a Whisper and a Chime. */
function PhonePeek() {
  return (
    <div
      role="img"
      aria-label="A peek at Howdy: a Post Card with reactions, a private Whisper, and a Chime saying a Pal gave you a Mark."
      className="relative mx-auto w-full max-w-[22rem] lg:max-w-[25rem]"
    >
      <Art
        name="sun"
        size="free"
        className="absolute -top-10 -right-6 w-20 motion-safe:animate-drift sm:-right-12 sm:w-24"
      />
      <Art
        name="cloud"
        size="free"
        className="absolute top-24 -left-10 w-16 opacity-90 motion-safe:animate-drift sm:-left-16 sm:w-20"
      />
      <Art
        name="bird"
        size="free"
        className="absolute -bottom-6 -left-4 w-12 motion-safe:animate-bird-hop sm:-left-10"
      />
      <Art name="sparkle" size="free" className="absolute right-2 -bottom-8 w-9 motion-safe:animate-drift" />

      <div
        aria-hidden="true"
        className="relative flex flex-col gap-3 rounded-xl border-[6px] border-surface bg-surface-sunken p-3 shadow-float"
      >
        {/* Post Card */}
        <div className="clay flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-pill bg-accent-soft text-caption font-bold text-text-primary">
              ME
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-caption font-semibold text-text-primary">Meera</p>
              <p className="text-metadata text-text-muted">@meera · just now</p>
            </div>
            <span className="rounded-sm border-2 border-dashed border-border-strong px-2 py-0.5 font-mono text-metadata text-text-secondary">
              Fence
            </span>
          </div>
          <p className="text-body text-text-primary">
            Chai on the porch at 6? Bring the guitar, I’ll bring the samosas.
          </p>
          <div className="flex items-center gap-2">
            {(['react-yo', 'react-fire', 'react-love', 'react-laugh'] as const).map((r, i) => (
              <span
                key={r}
                className="flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-1 text-metadata font-semibold text-text-secondary"
              >
                <Art name={r} size="free" className="size-5" loading="eager" />
                {[4, 3, 6, 2][i]}
              </span>
            ))}
          </div>
        </div>

        {/* Whisper */}
        <div className="clay flex flex-col gap-2 p-4">
          <p className="flex items-center gap-2 text-caption font-semibold text-text-primary">
            <Art name="nav-whispers" size="free" className="size-5" loading="eager" /> Whispers · Arjun
          </p>
          <p className="max-w-[85%] self-start rounded-lg rounded-bl-sm bg-surface-sunken px-3 py-2 text-caption text-text-primary">
            Saw your Porch Light on. Still up?
          </p>
          <p className="max-w-[85%] self-end rounded-lg rounded-br-sm bg-accent px-3 py-2 text-caption text-on-accent">
            Always, for you 😄
          </p>
          <p className="self-end font-mono text-metadata text-text-muted">11:02 PM · Seen</p>
        </div>

        {/* Chime */}
        <div className="flex items-center gap-3 rounded-pill bg-island px-4 py-2.5 text-on-island shadow-float">
          <Art name="mark-gem" size="free" className="size-7" loading="eager" />
          <p className="text-caption font-medium">Kavya gave you a Gem Mark</p>
        </div>
      </div>
    </div>
  );
}

/** The story of Howdy for people who have never seen it: what it is, what is built, how it keeps you safe, what is next. */
export default function WelcomePage() {
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/welcome" aria-label="Howdy" className="inline-flex min-h-11 items-center no-underline">
          <Img
            src="/brand/howdy-logo.png"
            width={640}
            height={239}
            alt="Howdy"
            loading="eager"
            className="h-9 w-auto sm:h-11"
          />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/step-inside" className={buttonClasses({ variant: 'ghost', compact: true })}>
            Step Inside
          </Link>
          <Link href="/stake-a-claim" className={buttonClasses({ compact: true })}>
            Join free
          </Link>
        </nav>
      </header>

      <main id="main">
        {/* The first screen: the promise, the way in, and a peek at the real thing. */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-12 lg:pb-24">
          <div className="flex flex-col items-start gap-6 motion-safe:animate-rise">
            <p className="flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-caption font-semibold text-text-secondary shadow-clay-sm">
              <Art name="hat" size="free" className="w-6" loading="eager" /> A small-circle social world
            </p>
            <h1 className="font-display text-[clamp(2.6rem,1.6rem+4.6vw,4.75rem)] leading-[1.02] font-semibold tracking-tight text-text-primary">
              Your people.
              <br />
              <span className="box-decoration-clone bg-linear-to-t from-accent-soft from-30% to-transparent to-30% px-1 -mx-1">
                Not the whole internet.
              </span>
            </h1>
            <p className="max-w-xl text-title font-normal text-text-secondary">
              Postcards on your fence, quiet visits to your porch and private whispers with your Pals. No
              endless feed. No follower counts. Just the people who matter.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link
                href="/stake-a-claim"
                className={cn(buttonClasses({ size: 'lg' }), 'nav-action-gloss relative')}
              >
                Stake a Claim — it’s free
              </Link>
              <a href="#tour" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                Take the tour
              </a>
            </div>
            <p className="text-caption text-text-muted">
              Works on any phone — add it to your home screen. Made in India, small on purpose.
            </p>
          </div>
          <div className="motion-safe:animate-rise">
            <PhonePeek />
          </div>
        </section>

        {/* Why it is different. */}
        <div className="bg-parchment">
          <Section kicker="Why Howdy" title="Social media, minus everything that made you tired of it.">
            <ul className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  [
                    'fence',
                    'No feed to doom-scroll',
                    'You visit Fences and Town Halls on purpose. Nothing is ranked, nothing auto-plays, and there is no bottom to fall into.',
                  ],
                  [
                    'friends',
                    'No follower counts',
                    'Pals are friends both ways. Nobody competes for numbers, and Marks are kind words, not a leaderboard.',
                  ],
                  [
                    'chat',
                    'Quiet by design',
                    'A “no” is never announced, blocks never show, and read receipts are a switch you control.',
                  ],
                ] as const
              ).map(([art, name, text], i) => (
                <li key={name} className="clay flex flex-col gap-3 p-6">
                  <span className={cn('flex size-16 items-center justify-center rounded-lg', TINTS[i])}>
                    <Art name={art} size="free" className="w-12" />
                  </span>
                  <h3 className="text-title text-text-primary">{name}</h3>
                  <p className="text-body text-text-secondary">{text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* What is built. */}
        <Section
          id="tour"
          kicker="On the porch today"
          title="Everything here is built and working right now."
        >
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <li key={f.name} className="clay flex gap-4 p-5">
                <span
                  className={cn(
                    'flex size-14 shrink-0 items-center justify-center rounded-lg',
                    TINTS[i % TINTS.length],
                  )}
                >
                  <Art name={f.art} size="free" className="size-10" />
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h3 className="text-title text-text-primary">{f.name}</h3>
                  <p className="text-caption text-text-secondary">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Safety. */}
        <div className="bg-surface-sunken">
          <Section kicker="Around the campfire" title="Safe and private, from the first line of code.">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAFETY.map((s) => (
                <li key={s.text} className="flex items-center gap-4 rounded-lg bg-surface p-4 shadow-clay-sm">
                  <Art name={s.art} size="free" className="size-11 shrink-0" />
                  <p className="text-body font-medium text-text-primary">{s.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* What is next. */}
        <Section kicker="Still on the trail" title="Howdy is young. Here is what comes next.">
          <ol className="relative flex max-w-3xl flex-col gap-4 border-l-2 border-dashed border-border-strong pl-6 sm:pl-8">
            {AHEAD.map((a) => (
              <li key={a.name} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-5 -left-[calc(1.5rem+7px)] size-3 rounded-pill bg-accent ring-4 ring-background sm:-left-[calc(2rem+7px)]"
                />
                <div className="clay flex flex-col gap-2 p-5">
                  <span className="self-start rounded-pill bg-warning px-2.5 py-0.5 font-mono text-metadata text-on-warning">
                    {a.tag}
                  </span>
                  <h3 className="text-title text-text-primary">{a.name}</h3>
                  <p className="text-body text-text-secondary">{a.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* The way in. */}
        <section
          aria-labelledby="join-title"
          className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24"
        >
          <div className="clay relative flex flex-col items-center gap-5 overflow-hidden bg-accent-soft px-6 py-12 text-center sm:py-16">
            <Art name="house" size="free" className="w-36 sm:w-44" />
            <h2
              id="join-title"
              className="font-display text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-semibold text-text-primary"
            >
              Pull up a chair.
            </h2>
            <p className="max-w-lg text-title font-normal text-text-secondary">
              Howdy is free, small on purpose, and better with your people in it. Claim your call sign before
              someone else does.
            </p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Link href="/stake-a-claim" className={buttonClasses({ size: 'lg' })}>
                Stake a Claim
              </Link>
              <ShareButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-caption text-text-muted sm:flex-row sm:px-6">
          <p>© 2026 Howdy · Made in India by Chiranjit Karmakar</p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap justify-center gap-x-4 [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center"
          >
            <Link href="/campfire-rules">Campfire Rules</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
