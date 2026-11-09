import type { Metadata } from 'next';
import { WelcomeStory } from '../../welcome-story';
import { lookUpInviter } from './inviter';

type Props = { params: Promise<{ code: string }> };

const DESCRIPTION =
  'Social media for people you actually know: share posts, Stories and messages with your friends, family and batch. No algorithm, no ads, no strangers in your inbox.';

/** Only the inviter's display name is ever shown (ADR-045); a link that does not work reads as the plain welcome. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const name = await lookUpInviter(code);
  const title = name
    ? `${name} invited you to Howdy`
    : name === undefined
      ? 'You’re invited to Howdy'
      : 'Howdy — stay close to your people';
  return {
    title: { absolute: title },
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: DESCRIPTION,
      url: `/i/${code}`,
      type: 'website',
      siteName: 'Howdy',
      locale: 'en_IN',
    },
    twitter: { card: 'summary_large_image', title, description: DESCRIPTION },
  };
}

/**
 * Someone's invite link (ADR-045): the welcome page, naming who invited you; every way in carries the code to sign-up.
 * A made-up, reset or dead link shows the ordinary welcome page — it never says the link is wrong. If the name cannot be
 * looked up right now, the page still opens and keeps the code: an invite never fails because of the name.
 */
export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  const invitedBy = await lookUpInviter(code);
  if (invitedBy === null) return <WelcomeStory />;
  return <WelcomeStory invite={invitedBy ? { code, invitedBy } : { code }} />;
}
