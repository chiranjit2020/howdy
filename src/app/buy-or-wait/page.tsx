import { withAskPortraits } from '@/app/_lib/asks';
import { listAsks } from '@/modules/asks';
import { requireUser } from '@/modules/auth';
import { listMine } from '@/modules/town-halls';
import { askListQuerySchema } from '@/shared/validation/town-halls';
import { AskFeed } from './ask-feed';

export const metadata = { title: 'Buy or wait?', robots: { index: false, follow: false } };

export default async function BuyOrWaitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const raw = await searchParams;
  const parsed = askListQuerySchema.safeParse({ show: typeof raw.show === 'string' ? raw.show : undefined });
  const show = parsed.success ? parsed.data.show : 'all';
  const [page, mine] = await Promise.all([listAsks(user.id, show), listMine(user.id)]);
  await withAskPortraits(user.id, page.asks);
  return (
    <main id="main" className="mx-auto flex w-full max-w-2xl min-w-0 flex-col py-4">
      <AskFeed
        key={show}
        show={show}
        initial={page.asks}
        nextCursor={page.nextCursor}
        groups={mine.map((g) => ({ id: g.id, name: g.name }))}
      />
    </main>
  );
}
