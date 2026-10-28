import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { parseTheme, THEME_COOKIE } from '@/ui/theme';
import { KitShowcase } from './kit-showcase';

export const metadata = { title: 'Design kit', robots: { index: false, follow: false } };

/**
 * Development-only component gallery. Returns 404 in production unless ENABLE_DESIGN_KIT=1, which exists so
 * end-to-end tests can exercise the real production CSP against real components. Never set it on a public deploy.
 */
export default async function KitPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DESIGN_KIT !== '1') notFound();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return <KitShowcase initialTheme={theme} />;
}
