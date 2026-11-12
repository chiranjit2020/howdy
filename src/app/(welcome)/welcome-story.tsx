import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import type { IconBaseProps } from 'react-icons';
import {
  PiBell,
  PiPhoneSlash,
  PiPushPin,
  PiUserCheck,
  PiProhibit,
  PiProhibitInset,
  PiChatsCircle,
  PiDownloadSimple,
  PiEye,
  PiDeviceMobile,
  PiHandWaving,
  PiHouse,
  PiHourglass,
  PiCamera,
  PiKey,
  PiScales,
  PiNote,
  PiBuildings,
  PiUsers,
  PiUser,
  PiQuotes,
  PiShieldCheck,
  PiVideoCamera,
} from 'react-icons/pi';
import { Img } from '@/ui/art/img';
import { cn } from '@/ui/cn';
import { HowdyLogo } from '@/ui/logo';
import { buttonClasses } from '@/ui/primitives';
import { ShareButton } from './welcome/share-button';

/**
 * The app's colours (2026-11-08): the sky-blue top bar, Sunflower with black ink for tiles and buttons, white cards.
 * Every icon tile is Sunflower with a black Phosphor line icon. The page alternates white and light sunflower bands.
 */
const TILE = 'bg-primary text-on-primary';

type Icon = ComponentType<IconBaseProps>;

// Every line here is checked against the app (2026-11-09). Keep it true: change it in the same commit as the feature.
const FEATURES: { icon: Icon; name: string; text: string }[] = [
  {
    icon: PiBuildings,
    name: 'Groups',
    text: 'For your batch, society, family or team: a pinned notice, events with a time and place, polls and photos. Ask-to-join and Deputies keep it tidy.',
  },
  {
    icon: PiUser,
    name: 'Your profile',
    text: 'Your photo, a cover, a short bio and the details you choose to share, each with its own audience.',
  },
  {
    icon: PiUsers,
    name: 'Friends',
    text: 'Add people you know, follow people you look up to (they aren’t told), mark close friends and invite with your own link.',
  },
  {
    icon: PiHouse,
    name: 'Home',
    text: 'Posts from your friends and the people you follow, newest first with no algorithm, plus Stories on top and friends you may know.',
  },
  {
    icon: PiNote,
    name: 'Posts',
    text: 'Words, a photo or a 30-second video, on your wall or a friend’s. Give a Star, reply, @mention, pin one to the top, edit a typo.',
  },
  { icon: PiCamera, name: 'Stories', text: 'A photo for your friends or close friends, gone in 12 hours.' },
  {
    icon: PiChatsCircle,
    name: 'Messages',
    text: 'Instant chats with friends that clear themselves after 7 days. “Seen” only if you both want it.',
  },
  {
    icon: PiHandWaving,
    name: 'Free to talk',
    text: 'Let your friends know you’re free for a while, so they know it’s a good time to message.',
  },
  { icon: PiEye, name: 'Profile visitors', text: 'See who stopped by your profile, or browse privately.' },
  {
    icon: PiQuotes,
    name: 'Testimonials & Describe',
    text: 'Like a slam book: kind words friends write, shown once you approve them, and the words friends pick for you.',
  },
  {
    icon: PiHourglass,
    name: 'Time Capsules',
    text: 'A message for yourself or a friend that opens on the day you choose: a birthday, results day, the next reunion.',
  },
  {
    icon: PiBell,
    name: 'Notifications',
    text: 'Live as things happen, on your phone too, plus “On this day” memories.',
  },
];

const SAFETY: { icon: Icon; text: string }[] = [
  { icon: PiScales, text: 'Everyone is 18 or older and agrees to the Community Guidelines' },
  { icon: PiProhibit, text: 'Block, restrict, mute and report quietly. Saying no is never announced' },
  { icon: PiKey, text: 'Passkeys and two-step sign-in keep your account yours' },
  { icon: PiShieldCheck, text: 'Every photo is checked before anyone sees it' },
  { icon: PiDownloadSimple, text: 'Download everything you have shared, any time' },
  { icon: PiProhibitInset, text: 'No ads, no tracking, and your data is never sold' },
];

/** Honest limits, said up front: small on purpose. */
const GOOD_TO_KNOW: { icon: Icon; name: string; text: string }[] = [
  {
    icon: PiVideoCamera,
    name: 'Short videos, for friends, for 3 days',
    text: 'Howdy is run by one person on a small budget, and videos take a lot of storage. So a post can carry one video of up to 30 seconds, on a wall only friends can see, and it disappears after 3 days. Your phone makes it smaller before it uploads. Groups, Stories and Messages don’t take videos yet.',
  },
  {
    icon: PiChatsCircle,
    name: 'Messages: friends only, gone in 7 days',
    text: 'You can only message your friends, which keeps strangers out of your inbox. Messages are deleted after 7 days, so keep anything important somewhere else.',
  },
  {
    icon: PiDeviceMobile,
    name: 'No app store needed',
    text: 'Howdy runs in your browser. Add it to your home screen and it opens like an app, with notifications.',
  },
];

const AHEAD: { name: string; text: string; tag: string }[] = [
  {
    tag: 'Planned',
    name: 'Even stronger photo safety',
    text: 'An extra layer of scanning for the worst kinds of images, on top of the checks every photo gets today.',
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

/**
 * Where the hero illustration comes from (Magnific, free licence: the credit must stay on the page while it is used).
 * The closing block's friends-around-a-phone picture is the user's own (Log in uses it too), so it needs no credit.
 */
const HERO_ILLUSTRATION =
  'https://www.magnific.com/free-vector/hand-drawn-iranian-women-illustration_33179751.htm';

/** The hero's picture: someone at their desk, with a soft sunflower sun behind her. Decorative. */
function HeroArt() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[17rem] sm:max-w-[26rem] lg:max-w-[30rem]"
    >
      <div className="absolute inset-x-[8%] top-[6%] aspect-square rounded-pill bg-highlight/35" />
      {/* The page's main picture: fetched first, and at the size the screen needs (2026-11-12: a phone was downloading
          the full 947 px, 127 KB, to show it 272 px wide; the 480 px copy is 32 KB). The widths match the box above. */}
      <Img
        src="/illustrations/welcome-hero.webp"
        srcSet="/illustrations/welcome-hero-480.webp 480w, /illustrations/welcome-hero-720.webp 720w, /illustrations/welcome-hero.webp 947w"
        sizes="(min-width: 1024px) 30rem, (min-width: 640px) 26rem, 17rem"
        width={947}
        height={1100}
        alt=""
        loading="eager"
        fetchPriority="high"
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
      {/* The app's own top bar: the sky blue with the white logo, so the page looks like what people step into. */}
      <header className="sticky top-0 z-30 bg-header">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <HowdyLogo tone="onColour" size="top" href="/welcome" />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link
              href="/login"
              className={cn(buttonClasses({ variant: 'secondary', size: 'sm' }), 'hover:no-underline')}
            >
              Log in
            </Link>
            <Link
              href={join}
              className={cn(buttonClasses({ size: 'sm' }), 'whitespace-nowrap hover:no-underline')}
            >
              Join free
            </Link>
          </nav>
        </div>
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
                : 'For your family, friends, batch and society'}
            </p>
            {/* The USP (2026-11-12): one place for your batch/society/family, and Howdy never asks for a phone number. */}
            <h1 className="font-display text-[clamp(2.25rem,1.5rem+3vw,3.5rem)] leading-[1.05] font-semibold tracking-tight text-text-primary">
              Your groups deserve better.{' '}
              {/* Two-tone: ink, then the top bar's blue (3.8:1 on white, fine at this size). Kept whole, never split. */}
              <span className="whitespace-nowrap text-header">Meet Howdy.</span>
            </h1>
            <p className="max-w-xl text-title font-normal text-text-secondary">
              A simpler, more private place to chat, share moments, plan events and keep everyone together.{' '}
              <strong className="font-semibold text-text-primary">Your phone number stays private.</strong>
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link href={join} className={cn(buttonClasses({ size: 'lg' }), 'hover:no-underline')}>
                Join Howdy — it’s free
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
          <Section kicker="Why Howdy" title="Everything the group chat should have been.">
            <ul className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  [
                    PiPhoneSlash,
                    'Your number stays yours',
                    'Howdy never asks for your phone number. In a group of 300, people see your name and username, nothing more.',
                  ],
                  [
                    PiPushPin,
                    'Notices that stay on top',
                    'Pin the one thing everyone has to read. Events and polls live in the group too, not under 400 good-morning messages.',
                  ],
                  [
                    PiUserCheck,
                    'You decide who’s in',
                    'Approve each new member, pick Deputies to help, and remove spammers quietly. Nobody is told who said no.',
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
          {/* Twelve features: three even rows of four on wide screens (icon above the words), two columns on phones. */}
          <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
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
                    className="absolute top-5 -left-[calc(1.5rem+7px)] size-3 rounded-pill bg-header ring-4 ring-primary-soft sm:-left-[calc(2rem+7px)]"
                  />
                  <div className="clay flex flex-col gap-2 p-5">
                    <span className="self-start rounded-pill bg-primary px-2.5 py-0.5 tabular-nums text-metadata text-on-primary">
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

        {/* The way in: the blue of the top bar, one step deeper so its sentence can be white (4.9:1; the bar's own blue
            is 3.8:1, enough for headlines only), with Log in's friends around one phone. */}
        <section
          aria-labelledby="join-title"
          className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-24"
        >
          <div className="grid items-center gap-8 overflow-hidden rounded-card bg-header-deep px-6 py-10 shadow-clay sm:px-10 sm:py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-10">
            <div className="flex flex-col items-start gap-5">
              <h2
                id="join-title"
                className="font-display text-[clamp(2rem,1.4rem+2.6vw,3.25rem)] leading-tight font-semibold text-on-header"
              >
                Pull up a chair.
              </h2>
              <p className="max-w-md text-heading text-on-header">
                Howdy is free and small on purpose. Bring your batch over: one link invites everyone.
              </p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link href={join} className={cn(buttonClasses({ size: 'lg' }), 'hover:no-underline')}>
                  Sign up
                </Link>
                <ShareButton />
              </div>
            </div>
            <Img
              src="/illustrations/friends-phone-1280.webp"
              srcSet="/illustrations/friends-phone-720.webp 720w, /illustrations/friends-phone-1280.webp 1280w"
              sizes="(min-width: 64rem) 34rem, 90vw"
              width={1280}
              height={720}
              alt="Five friends laughing together at something on one phone"
              className="h-auto w-full rounded-card"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-caption text-text-muted sm:flex-row sm:px-6">
          <p className="text-center sm:text-left">
            © 2026 Howdy · Made in India by Chiranjit Karmakar
            <span className="block text-metadata">
              Illustration at the desk from{' '}
              <a href={HERO_ILLUSTRATION} target="_blank" rel="noopener noreferrer" className="underline">
                Magnific
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
