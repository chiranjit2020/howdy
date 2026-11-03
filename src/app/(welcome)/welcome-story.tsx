import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  GoBell,
  GoBellSlash,
  GoBlocked,
  GoCircleSlash,
  GoCommentDiscussion,
  GoDownload,
  GoEye,
  GoHeart,
  GoHourglass,
  GoImage,
  GoInfinity,
  GoKey,
  GoLaw,
  GoNote,
  GoOrganization,
  GoPeople,
  GoPerson,
  GoQuote,
  GoShieldCheck,
  GoVideo,
} from 'react-icons/go';
import { Img } from '@/ui/art/img';
import { cn } from '@/ui/cn';
import { buttonClasses } from '@/ui/primitives';
import { ShareButton } from './welcome/share-button';

/** Every icon tile: sunflower with a violet line icon (Octicons, like the app). The page is white and light sunflower. */
const TILE = 'bg-primary text-on-primary';

type Icon = ComponentType<IconBaseProps>;

const FEATURES: { icon: Icon; name: string; text: string }[] = [
  {
    icon: GoPerson,
    name: 'Your profile',
    text: 'Your photo, cover, a few words and the details you choose to share, each with its own audience.',
  },
  {
    icon: GoPeople,
    name: 'Friends',
    text: 'Add people you know, meet friends of your friends, follow people you look up to, and invite with your own link.',
  },
  {
    icon: GoNote,
    name: 'Posts',
    text: 'Write on a friend’s wall, react, reply, mention with @name, and pin one post to the top of yours.',
  },
  { icon: GoImage, name: 'Stories', text: 'A photo for your friends or close friends, gone in 12 hours.' },
  {
    icon: GoCommentDiscussion,
    name: 'Messages',
    text: 'Private chats with friends, with “Seen” only if you both want it.',
  },
  {
    icon: GoOrganization,
    name: 'Groups',
    text: 'Circles for your batch, family or team, with events, polls and a pinned notice.',
  },
  { icon: GoEye, name: 'Profile visitors', text: 'See who stopped by, or browse privately.' },
  {
    icon: GoQuote,
    name: 'Testimonials & Describe',
    text: 'Kind words you approve, and the word friends pick for you.',
  },
  { icon: GoHourglass, name: 'Time Capsules', text: 'Words that open on a day you choose.' },
  { icon: GoBell, name: 'Notifications', text: 'On your phone too, plus “On this day” memories.' },
];

const SAFETY: { icon: Icon; text: string }[] = [
  { icon: GoLaw, text: 'Community Guidelines everyone agrees to before they join' },
  { icon: GoBlocked, text: 'Block, restrict and report quietly. Saying no is never announced' },
  { icon: GoKey, text: 'Passkeys and two-step sign-in keep your account yours' },
  { icon: GoShieldCheck, text: 'Every photo is checked before anyone sees it' },
  { icon: GoDownload, text: 'Download everything you have shared, any time' },
  { icon: GoCircleSlash, text: 'No ads, no tracking, and your data is never sold' },
];

/** Honest limits, said up front: small on purpose. */
const GOOD_TO_KNOW: { icon: Icon; name: string; text: string }[] = [
  {
    icon: GoVideo,
    name: 'Photos, not videos (for now)',
    text: 'Howdy is run by one person on a small budget, and videos take a lot of storage. You can share photos in posts, groups and Stories. Video isn’t supported yet.',
  },
  {
    icon: GoCommentDiscussion,
    name: 'Friends only for messages',
    text: 'You can only message people who are your friends, which keeps strangers out of your inbox.',
  },
  {
    icon: GoHeart,
    name: 'No ads, ever',
    text: 'Howdy is free and does not sell your data. It grows slowly, by invitation.',
  },
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
  {
    tag: 'Later',
    name: 'Video, once storage allows',
    text: 'Short videos in posts and Stories, when Howdy can afford to store them well.',
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
      className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-10 sm:px-6 sm:py-14"
    >
      <p className="tabular-nums text-metadata tracking-widest text-text-muted uppercase">{kicker}</p>
      <h2
        id={`${id ?? kicker}-title`}
        className="mt-2 max-w-2xl font-display text-[clamp(1.75rem,1.2rem+2.2vw,2.75rem)] leading-tight font-semibold text-text-primary"
      >
        {title}
      </h2>
      <div className="mt-6 sm:mt-8">{children}</div>
    </section>
  );
}

/** Where the illustrations come from (Magnific, free licence: the credit must stay on the page while they are used). */
const ILLUSTRATIONS = [
  'https://www.magnific.com/free-vector/hand-drawn-iranian-women-illustration_33179751.htm',
  'https://www.magnific.com/free-vector/hand-drawn-iranian-women-illustration_33179743.htm',
];

/** The hero's picture: someone at their desk, with a soft sunflower sun behind her. Decorative. */
function HeroArt() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[17rem] sm:max-w-[26rem] lg:max-w-[30rem]"
    >
      <div className="absolute inset-x-[8%] top-[6%] aspect-square rounded-pill bg-highlight/35" />
      <Img
        src="/illustrations/welcome-hero.webp"
        width={947}
        height={1100}
        alt=""
        loading="eager"
        className="relative h-auto w-full"
      />
    </div>
  );
}

/**
 * The story of Howdy for people who have never seen it: what it is, what is built, how it keeps you safe, what is next.
 * Shown at /welcome, and at /i/<code> with `invite` (ADR-045): then it names who invited them, and every way in carries
 * the code to sign-up.
 */
export function WelcomeStory({ invite }: { invite?: { code: string; invitedBy?: string } }) {
  const join = invite ? `/signup?invite=${invite.code}` : '/signup';
  return (
    <>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/welcome" aria-label="Howdy" className="inline-flex min-h-11 items-center no-underline">
          <Img
            src="/brand/howdy-wordmark.png"
            width={728}
            height={224}
            alt="Howdy"
            loading="eager"
            className="h-9 w-auto sm:h-11"
          />
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2">
          <Link href="/login" className={buttonClasses({ variant: 'ghost', compact: true })}>
            Log in
          </Link>
          <Link href={join} className={buttonClasses({ compact: true })}>
            Join free
          </Link>
        </nav>
      </header>

      <main id="main">
        {/* The first screen: the promise, the way in, and a peek at the real thing. */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pt-4 pb-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-6 lg:pb-12">
          <div className="flex flex-col items-start gap-6 motion-safe:animate-rise">
            <p className="flex items-center gap-2 rounded-pill bg-surface px-3 py-1.5 text-caption font-semibold text-text-secondary shadow-clay-sm">
              {invite
                ? invite.invitedBy
                  ? `${invite.invitedBy} invited you to Howdy`
                  : 'You’re invited to Howdy'
                : 'Social media for people you actually know'}
            </p>
            <h1 className="font-display text-[clamp(2.6rem,1.6rem+4.6vw,4.75rem)] leading-[1.02] font-semibold tracking-tight text-text-primary">
              Stay close
              <br />
              {/* Two-tone, like the wordmark: no highlighter. */}
              <span className="text-accent">to your people.</span>
            </h1>
            <p className="max-w-xl text-title font-normal text-text-secondary">
              Share posts, Stories and messages with your friends, family and batch — without the endless
              feed, follower counts or strangers.
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={join} className={cn(buttonClasses({ size: 'lg' }), 'nav-action-gloss relative')}>
                Sign up — it’s free
              </Link>
              <a href="#tour" className={buttonClasses({ variant: 'secondary', size: 'lg' })}>
                See how it works
              </a>
            </div>
            <p className="text-caption text-text-muted">Free · No ads · Made in India</p>
          </div>
          <div className="motion-safe:animate-rise">
            <HeroArt />
          </div>
        </section>

        {/* Why it is different. */}
        <div className="bg-primary-soft">
          <Section kicker="Why Howdy" title="Social media, minus the parts that wear you out.">
            <ul className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  [
                    GoInfinity,
                    'No feed to get lost in',
                    'You open a friend’s wall or a group on purpose. Nothing is ranked, nothing autoplays, and there’s no end to scroll to.',
                  ],
                  [
                    GoPeople,
                    'No follower race',
                    'Friends are friends both ways. Nobody sees counts, so nobody competes for them.',
                  ],
                  [
                    GoBellSlash,
                    'Quiet by design',
                    'Saying no is never announced, blocks never show, and read receipts are your choice.',
                  ],
                ] as const
              ).map(([WhyIcon, name, text]) => (
                <li key={name} className="clay flex flex-col gap-3 p-6">
                  <span className={cn('flex size-12 items-center justify-center rounded-lg', TILE)}>
                    <WhyIcon aria-hidden="true" className="size-6" />
                  </span>
                  <h3 className="text-title text-text-primary">{name}</h3>
                  <p className="text-body text-text-secondary">{text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* What is built. */}
        <Section id="tour" kicker="What’s inside" title="Everything here works today.">
          {/* Ten features: two even rows of five on wide screens (icon above the words), two columns on phones. */}
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {FEATURES.map((f) => (
              <li key={f.name} className="clay flex flex-col gap-3 p-4 sm:p-5">
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', TILE)}>
                  <f.icon aria-hidden="true" className="size-5" />
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
        <div className="bg-primary-soft">
          <Section kicker="Safety" title="Safe and private from day one.">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SAFETY.map((s) => (
                <li key={s.text} className="flex items-center gap-4 rounded-lg bg-surface p-4 shadow-clay-sm">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-on-primary">
                    <s.icon aria-hidden="true" className="size-5" />
                  </span>
                  <p className="text-body font-medium text-text-primary">{s.text}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Honest limits. */}
        <Section kicker="Good to know" title="Small on purpose, honest about it.">
          <ul className="grid gap-4 sm:grid-cols-3">
            {GOOD_TO_KNOW.map((g) => (
              <li key={g.name} className="clay flex flex-col gap-3 p-6">
                <span className={cn('flex size-12 items-center justify-center rounded-lg', TILE)}>
                  <g.icon aria-hidden="true" className="size-6" />
                </span>
                <h3 className="text-title text-text-primary">{g.name}</h3>
                <p className="text-body text-text-secondary">{g.text}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* What is next. */}
        <div className="bg-primary-soft">
          <Section kicker="What’s next" title="Howdy is young. Here is what comes next.">
            <ol className="relative flex max-w-3xl flex-col gap-4 border-l-2 border-dashed border-border-strong pl-6 sm:pl-8">
              {AHEAD.map((a) => (
                <li key={a.name} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-5 -left-[calc(1.5rem+7px)] size-3 rounded-pill border-2 border-accent bg-highlight ring-4 ring-background sm:-left-[calc(2rem+7px)]"
                  />
                  <div className="clay flex flex-col gap-2 p-5">
                    <span className="self-start rounded-pill bg-warning px-2.5 py-0.5 tabular-nums text-metadata text-on-warning">
                      {a.tag}
                    </span>
                    <h3 className="text-title text-text-primary">{a.name}</h3>
                    <p className="text-body text-text-secondary">{a.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-6 max-w-3xl text-body text-text-secondary">
              Members help decide what comes next: there is a feedback form inside the app, and we read every
              message.
            </p>
          </Section>
        </div>

        {/* The way in. */}
        <section
          aria-labelledby="join-title"
          className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-24"
        >
          <div className="clay relative flex flex-col items-center gap-5 overflow-hidden bg-primary-soft px-6 py-12 text-center sm:py-16">
            <Img
              src="/illustrations/welcome-skate.webp"
              width={837}
              height={1000}
              alt=""
              aria-hidden="true"
              className="-mt-4 h-auto w-36 sm:-mt-6 sm:w-48"
            />
            <h2
              id="join-title"
              className="font-display text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-semibold text-text-primary"
            >
              Pull up a chair.
            </h2>
            <p className="max-w-lg text-title font-normal text-text-secondary">
              Howdy is free, small on purpose, and better with your people in it. Claim your username before
              someone else does.
            </p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <Link href={join} className={buttonClasses({ size: 'lg' })}>
                Sign up
              </Link>
              <ShareButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-caption text-text-muted sm:flex-row sm:px-6">
          <p className="text-center sm:text-left">
            © 2026 Howdy · Made in India by Chiranjit Karmakar
            <span className="block text-metadata">
              Illustrations from Magnific:{' '}
              <a href={ILLUSTRATIONS[0]} target="_blank" rel="noopener noreferrer" className="underline">
                at the desk
              </a>
              ,{' '}
              <a href={ILLUSTRATIONS[1]} target="_blank" rel="noopener noreferrer" className="underline">
                on the skateboard
              </a>
            </span>
          </p>
          <nav
            aria-label="Legal"
            className="flex flex-wrap justify-center gap-x-4 [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center"
          >
            <Link href="/community-guidelines">Community Guidelines</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
        </div>
      </footer>
    </>
  );
}
