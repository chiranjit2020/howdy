import { requireUser } from '@/modules/auth';
import { FEEDBACK_PAGE } from '@/shared/validation/feedback';
import { PageFrame } from '@/ui/howdy/page-frame';
import { FeedbackForm } from './feedback-form';

export const metadata = { title: 'Send feedback' };

/**
 * Feedback about Howdy (ADR-059), in Home's frame. `?from=/somewhere` (set by the links into it) says which page it was
 * about; anything that is not a plain in-app path is ignored.
 */
export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  await requireUser();
  const { from } = await searchParams;
  const page =
    typeof from === 'string' && FEEDBACK_PAGE.test(from) && from !== '/feedback' ? from : undefined;
  return (
    <PageFrame>
      <div className="flex flex-col gap-1">
        <h1 className="text-heading text-text-primary">Send feedback</h1>
        <p className="text-caption text-text-secondary">
          An idea, something broken, or anything else about Howdy. We read every one.
        </p>
      </div>
      <FeedbackForm {...(page ? { page } : {})} />
    </PageFrame>
  );
}
