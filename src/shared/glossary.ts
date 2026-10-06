/** Plain-English one-liners for Howdy's own vocabulary, shown by `GlossaryHint` next to a term's first appearance. */
export const GLOSSARY = {
  ranch: { term: 'Porch', definition: 'Your profile — the page people land on when they look you up.' },
  fence: { term: 'Fence', definition: 'Your public wall. Anyone who can see it can leave a Post Card here.' },
  posse: { term: 'Pals', definition: 'Your friends on Howdy — people you have both agreed to connect with.' },
  chimes: {
    term: 'Chimes',
    definition: "Your notifications — replies, Yo's, Tributes and anything else worth knowing.",
  },
  whispers: { term: 'Whispers', definition: 'Private messages between you and one other person.' },
  tracks: { term: 'Tracks', definition: 'A record of who has recently stopped by your Porch.' },
  townHalls: { term: 'Town Halls', definition: 'Group spaces where a whole community can talk together.' },
  tributes: {
    term: 'Tributes',
    definition:
      'Public compliments from your Pals and Town Hall neighbours — you approve each one before it shows.',
  },
  vibeMatrix: {
    term: 'Vibe Matrix',
    definition:
      'A tally of Marks from your Pals and Town Hall neighbours — a feel for your vibe, not a leaderboard.',
  },
  trusted: {
    term: 'Trusted tick',
    definition:
      'A gold tick earned over time from your Pals and the Marks they give you. Nobody can ask for it or buy it, and it is never a score.',
  },
  signal: {
    term: 'Signal',
    definition: 'A short status you set that shows on your Porch for the next 12 hours.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
