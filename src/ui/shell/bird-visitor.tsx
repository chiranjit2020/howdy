'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/*
 * Now and then the little blue bird in the top bar flies down, perches on the top edge of a card that is on screen, bobs
 * and chirps, then flies off; the top-bar bird comes back a moment later. Decoration only: nothing depends on it, it is
 * hidden from assistive tech, and a tap sends it off early.
 *
 * Kept quiet on purpose: the first visit comes after 20–45 s, later ones every 1.5–3 min, and a visit is skipped (tried
 * again soon) while the tab is hidden, a dialog is open, or someone is typing. It leaves early if its card scrolls out of
 * view. Reduced motion: it never flies. Sound: a soft two-note chirp made on the spot (no audio file), which browsers only
 * allow after the page has been tapped or typed in once, so the first visit before that is silent.
 */

const BIRD_W = 40;
const BIRD_H = Math.round((BIRD_W * 91) / 94); // bird.png is 94 × 91
const TOP_BAR = 64;
const FIRST_VISIT: Range = [20_000, 45_000];
const NEXT_VISIT: Range = [90_000, 180_000];
const RETRY: Range = [20_000, 40_000];
const PERCH: Range = [4_000, 7_000];

type Range = readonly [number, number];
const between = ([a, b]: Range) => a + Math.random() * (b - a);

let audio: AudioContext | undefined;

/** Browsers only let a page make sound after a tap or key press; the first one unlocks it for the rest of the visit. */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // No Web Audio: the bird is just quiet.
  }
}

/** A soft, quick two-note "tweet-tweet": two short rising sine sweeps. */
function chirp() {
  const a = audio;
  if (!a || a.state !== 'running') return;
  const t = a.currentTime;
  for (const [delay, from, to] of [
    [0, 2600, 4200],
    [0.12, 2900, 4600],
  ] as const) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t + delay);
    osc.frequency.exponentialRampToValueAtTime(to, t + delay + 0.07);
    gain.gain.setValueAtTime(0.0001, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.05, t + delay + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.085);
    osc.connect(gain).connect(a.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.1);
  }
}

/** The bottom of the screen that is free of the phone tab bar (it only exists below md). */
const freeBottom = () => window.innerHeight - (window.innerWidth < 768 ? 104 : 16);

/** A spot on the top edge of a random card that is fully in view, in page coordinates; undefined if there is none. */
function pickPerch() {
  const cards = [...document.querySelectorAll<HTMLElement>('main .clay')].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width >= 160 && r.top >= TOP_BAR + BIRD_H + 8 && r.top <= freeBottom() - 48;
  });
  const card = cards[Math.floor(Math.random() * cards.length)];
  if (!card) return undefined;
  const r = card.getBoundingClientRect();
  return {
    x: r.left + between([20, r.width - 20 - BIRD_W]) + window.scrollX,
    // Feet just over the card's edge.
    y: r.top - BIRD_H + 5 + window.scrollY,
  };
}

function busy() {
  const el = document.activeElement;
  const typing =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el as HTMLElement | null)?.isContentEditable;
  return (
    document.hidden ||
    typing ||
    document.querySelector(
      // Closed <dialog>s stay in the page (the sign-out confirmation, say), so only open ones count.
      'dialog[open], [role="dialog"]:not(dialog), [role="alertdialog"]:not(dialog)',
    ) !== null
  );
}

export function BirdVisitor() {
  const pathname = usePathname();

  useEffect(() => {
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Restarted on every page change: a bird perched on the old page's card simply goes.
  useEffect(() => {
    // No matchMedia (some embedded browsers, test DOMs): the bird simply stays home.
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    let bird: HTMLDivElement | undefined;
    let stopWatching: (() => void) | undefined;

    function goHome() {
      stopWatching?.();
      stopWatching = undefined;
      bird?.remove();
      bird = undefined;
      delete root.dataset.birdAway;
    }

    function schedule(range: Range) {
      later(visit, between(range));
    }

    function visit() {
      const home = document.querySelector<HTMLElement>('[data-howdy-bird]');
      const spot = home && !busy() ? pickPerch() : undefined;
      if (!home || !spot) return schedule(RETRY);
      const perch = spot;

      const from = home.getBoundingClientRect();
      const start = { x: from.left + window.scrollX, y: from.top + window.scrollY };
      // Faces right as drawn; flipped when flying left.
      const facing = perch.x >= start.x ? 1 : -1;

      // Three layers: position (flight), facing (flip), body (flap, bob, squash).
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = `position:absolute;left:0;top:0;z-index:35;width:${BIRD_W}px;height:${BIRD_H}px;cursor:pointer;will-change:transform`;
      const face = document.createElement('div');
      face.style.cssText = `width:100%;height:100%;transition:transform .2s;transform:scaleX(${facing})`;
      const body = document.createElement('img');
      body.src = '/art/bird.png';
      body.alt = '';
      body.draggable = false;
      body.style.cssText =
        'width:100%;height:100%;object-fit:contain;transform-origin:50% 100%;user-select:none';
      face.append(body);
      el.append(face);
      document.body.append(el);
      bird = el;
      root.dataset.birdAway = '';

      const flap = () =>
        body.animate([{ transform: 'none' }, { transform: 'scaleY(0.8) rotate(-8deg)' }], {
          duration: 110,
          iterations: Infinity,
          direction: 'alternate',
        });

      const distance = Math.hypot(perch.x - start.x, perch.y - start.y);
      const peak = Math.min(start.y, perch.y) - 40;
      let flapping = flap();
      const flight = el.animate(
        [
          { transform: `translate(${start.x}px, ${start.y}px) scale(0.9)` },
          {
            transform: `translate(${(start.x + perch.x) / 2}px, ${peak}px) rotate(${-8 * facing}deg)`,
            offset: 0.45,
          },
          { transform: `translate(${perch.x}px, ${perch.y}px)` },
        ],
        {
          duration: Math.min(1600, 700 + distance * 1.2),
          easing: 'cubic-bezier(.45,0,.25,1)',
          fill: 'forwards',
        },
      );

      let leaving = false;
      // Every callback checks it still belongs to this bird (the page may have sent it home and started another).
      function leave() {
        if (leaving || bird !== el) return;
        leaving = true;
        stopWatching?.();
        stopWatching = undefined;
        const dir = Math.random() < 0.5 ? -1 : 1;
        face.style.transform = `scaleX(${dir})`;
        body.style.animation = '';
        flapping = flap();
        const exitX = dir > 0 ? window.scrollX + window.innerWidth + 60 : window.scrollX - BIRD_W - 60;
        el.animate(
          [
            { transform: `translate(${perch.x}px, ${perch.y}px)` },
            { transform: `translate(${exitX}px, ${perch.y - 220}px) rotate(${-10 * dir}deg)` },
          ],
          { duration: 900, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' },
        ).finished.then(
          () => {
            if (bird !== el) return;
            flapping.cancel();
            goHome();
            schedule(NEXT_VISIT);
          },
          () => {},
        );
      }

      flight.finished.then(
        () => {
          if (bird !== el) return;
          flapping.cancel();
          body.animate(
            [
              { transform: 'scaleY(0.78) translateY(3px)' },
              { transform: 'scaleY(1.06)' },
              { transform: 'none' },
            ],
            { duration: 320, easing: 'ease-out' },
          );
          body.style.animation = 'var(--animate-bird-hop)';
          chirp();

          // Leave early if tapped, or if the card scrolls under the top bar or the tab bar.
          const onScroll = () => {
            const y = perch.y - window.scrollY;
            if (y < TOP_BAR || y + BIRD_H > freeBottom()) leave();
          };
          el.addEventListener('pointerdown', leave);
          window.addEventListener('scroll', onScroll, { passive: true });
          window.addEventListener('resize', leave);
          stopWatching = () => {
            el.removeEventListener('pointerdown', leave);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', leave);
          };

          const stay = between(PERCH);
          // A look over its shoulder, and now and then a second chirp.
          const look = (way: number) => () => {
            if (!leaving) face.style.transform = `scaleX(${way})`;
          };
          later(look(-facing), stay * 0.4);
          later(look(facing), stay * 0.7);
          if (Math.random() < 0.5) {
            later(() => {
              if (!leaving) chirp();
            }, stay * 0.55);
          }
          later(leave, stay);
        },
        () => {},
      );
    }

    // Switching away sends a visiting bird home at once; the next visit is then planned as usual.
    const onHidden = () => {
      if (!document.hidden || !bird) return;
      goHome();
      schedule(RETRY);
    };
    document.addEventListener('visibilitychange', onHidden);
    schedule(FIRST_VISIT);

    return () => {
      for (const id of timers) clearTimeout(id);
      document.removeEventListener('visibilitychange', onHidden);
      goHome();
    };
  }, [pathname]);

  return null;
}
