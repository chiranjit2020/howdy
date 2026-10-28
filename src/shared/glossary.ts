/** Plain-English one-liners for Howdy's own vocabulary, shown by `GlossaryHint` next to a term's first appearance. */
export const GLOSSARY = {
  ranch: { term: 'Profile', definition: 'Your profile — the page people land on when they look you up.' },
  fence: { term: 'Wall', definition: 'Your public wall. Anyone who can see it can leave a post here.' },
  posse: {
    term: 'Friends',
    definition: 'Your friends on Howdy — people you have both agreed to connect with.',
  },
  chimes: {
    term: 'Notifications',
    definition: 'Your notifications — replies, waves, testimonials and anything else worth knowing.',
  },
  whispers: { term: 'Messages', definition: 'Private messages between you and one other person.' },
  tracks: { term: 'Profile visitors', definition: 'A record of who has recently stopped by your profile.' },
  townHalls: { term: 'Groups', definition: 'Group spaces where a whole community can talk together.' },
  tributes: {
    term: 'Testimonials',
    definition:
      'Public compliments from your friends and group neighbours — you approve each one before it shows.',
  },
  vibeMatrix: {
    term: 'Badges',
    definition:
      'A tally of badges from your friends and group neighbours — a feel for your vibe, not a leaderboard.',
  },
  trusted: {
    term: 'Trusted tick',
    definition:
      'A gold tick earned over time from your friends and the badges they give you. Nobody can ask for it or buy it, and it is never a score.',
  },
  signal: {
    term: 'Status',
    definition: 'A short status you set that shows on your profile for the next 12 hours.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
