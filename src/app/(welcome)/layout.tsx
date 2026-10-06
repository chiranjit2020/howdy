import type { ReactNode } from 'react';

/**
 * The welcome page stands on its own: no app shell, no sidebar — just the story, for people who have never seen Howdy.
 * Always Daylight, like the app itself, so it looks exactly like what they will step into.
 */
export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return <div className="daylight-only min-h-dvh overflow-x-clip bg-background">{children}</div>;
}
