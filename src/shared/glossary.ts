/**
 * Plain-English one-liners for Howdy's own vocabulary, shown by `GlossaryHint` (a HelpTip) next to a term's first
 * appearance. A hint can show on anyone's page, not only your own: say what the thing is, and keep it true for every
 * setting (a wall may be friends-only; who may write on it is the owner's choice).
 */
export const GLOSSARY = {
  fence: {
    term: 'Wall',
    definition: 'The posts on a profile. Its owner chooses who can read the wall and who can write on it.',
  },
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
  trusted: {
    term: 'Trusted tick',
    definition:
      'A gold tick earned over time from your friends and the badges they give you. Nobody can ask for it or buy it, and it is never a score.',
  },
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
