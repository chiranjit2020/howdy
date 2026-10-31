'use client';

import { Button, useToast } from '@/ui/primitives';
import { focusPeopleSearch, openFreeToTalk } from '@/ui/shell/shell-events';

/** Free now, when nobody is: open the top bar's Free to talk panel. */
export function SwitchYoursOn() {
  return (
    <Button size="sm" variant="secondary" className="self-start" onClick={openFreeToTalk}>
      Tell friends you’re free
    </Button>
  );
}

/** A new account with no friends yet: search for people, or hand someone your profile link. */
export function FindFriendsActions({ handle }: { handle: string }) {
  const toast = useToast();

  async function share() {
    const url = `${window.location.origin}/profile/${handle}`;
    // The phone's own share sheet where there is one; otherwise copy the link.
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Find me on Howdy', url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied. Send it to a friend.', tone: 'success' });
    } catch {
      toast({ title: `Your link: ${url}`, tone: 'info' });
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="sm" onClick={focusPeopleSearch}>
        Search people
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void share()}>
        Share my link
      </Button>
    </div>
  );
}
