import type { Metadata } from 'next';
import { inviterName } from '@/modules/invites';
import { WelcomeStory } from '../../welcome-story';

type Props = { params: Promise<{ code: string }> };

const DESCRIPTION =
  'A small-circle social world: postcards on your fence, quiet porch visits and private whispers. No endless feed. No follower counts.';

/** Only the inviter's display name is ever shown (ADR-045); a link that does not work reads as the plain welcome. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = await inviterName((await params).code);
  const title = name ? `${name} invited you to Howdy` : 'Howdy — your people, not the whole internet';
  return {
    title: { absolute: title },
    description: DESCRIPTION,
    robots: { index: false, follow: false },
    openGraph: { title, description: DESCRIPTION, type: 'website', siteName: 'Howdy' },
    twitter: { card: 'summary_large_image', title, description: DESCRIPTION },
  };
}

/**
 * Someone's invite link (ADR-045): the welcome page, naming who invited you; every way in carries the code to sign-up.
 * A made-up, reset or dead link shows the ordinary welcome page — it never says the link is wrong.
 */
export default async function InvitePage({ params }: Props) {
  const { code } = await params;
  const invitedBy = await inviterName(code);
  return <WelcomeStory {...(invitedBy ? { invite: { code, invitedBy } } : {})} />;
}
