import type { Metadata } from 'next';
import { WelcomeStory } from '../welcome-story';

const TITLE = 'Howdy — stay close to your people';
const DESCRIPTION =
  'Social media for people you actually know: share posts, Stories and messages with your friends, family and batch. No endless feed, no follower counts, no strangers.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/welcome' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: '/welcome',
    type: 'website',
    siteName: 'Howdy',
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

/** The link people share: what Howdy is, what is built, how it keeps you safe, what is next. */
export default function WelcomePage() {
  return <WelcomeStory />;
}
