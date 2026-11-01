import type { Metadata } from 'next';
import { WelcomeStory } from '../welcome-story';

const TITLE = 'Howdy — your people, not the whole internet';
const DESCRIPTION =
  'Social media for people you actually know: share posts, Stories and messages with your friends, family and batch. No endless feed, no follower counts, no strangers.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website', siteName: 'Howdy' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/** The link people share: what Howdy is, what is built, how it keeps you safe, what is next. */
export default function WelcomePage() {
  return <WelcomeStory />;
}
