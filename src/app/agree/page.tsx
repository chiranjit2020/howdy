import { redirect } from 'next/navigation';
import { AppFrame } from '@/app/_lib/app-shell';
import { pendingAcceptances, requireUser } from '@/modules/auth';
import { LEGAL_DOCS } from '@/shared/legal';
import { ClayCard } from '@/ui/primitives';
import { AgreeForm } from './agree-form';

export const metadata = { title: 'Before you carry on', robots: { index: false, follow: false } };

/**
 * Shown once to a signed-in person who has not agreed to the current Terms / Privacy Policy: an account from before they
 * existed, or after a change that needs agreeing to again. Everything else is out of reach until they agree (AppFrame
 * sends them here); the legal pages stay readable.
 */
export default async function AgreePage() {
  const user = await requireUser();
  const pending = await pendingAcceptances(user.id);
  if (pending.length === 0) redirect('/home');
  const firstTime = pending.length === 2;
  return (
    <AppFrame askToAgree={false}>
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-4 py-6 sm:py-10">
        <ClayCard className="flex flex-col gap-4 sm:p-8">
          <h1 className="font-display text-heading text-text-primary">
            {firstTime ? 'A few ground rules' : 'We updated our terms'}
          </h1>
          <p className="text-body text-text-secondary">
            {firstTime
              ? 'Howdy now has written Terms of Service and a Privacy Policy. They explain what we collect, how long we keep it, and how we look after each other. Please read them and agree to carry on.'
              : `We changed the ${pending.map((d) => LEGAL_DOCS[d].title).join(' and ')}. Please read the new version and agree to carry on.`}
          </p>
          <AgreeForm />
        </ClayCard>
      </main>
    </AppFrame>
  );
}
