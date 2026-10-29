'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { PortraitTint } from '@/shared/validation/profile';
import { apiRequest } from '../auth/api';
import { cn } from '../cn';
import { SearchIcon } from '../icons';
import { Avatar } from '../primitives/avatar';
import { useDismiss } from '../primitives/use-dismiss';
import { FOCUS_PEOPLE_SEARCH } from './shell-events';

interface Person {
  handle: string;
  displayName: string;
  portraitTint: PortraitTint;
  portraitUrl?: string;
  friend: boolean;
}

const MIN = 2;
const WAIT_MS = 250;

/**
 * Find people by name or @username (WAI-ARIA combobox). Only people who let themselves be found, plus your friends; the
 * server decides who that is. Results come as you type (after a short pause, older answers dropped); arrows move,
 * Enter opens the profile, Escape or a click outside closes. `page` is the phone's full-page form: the list stays open
 * below the box instead of floating over the page.
 */
export function PeopleSearch({ page = false, autoFocus = false }: { page?: boolean; autoFocus?: boolean }) {
  const router = useRouter();
  const listId = useId();
  const statusId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open && !page, [root], close);
  // The top bar's box answers pages that ask for it (Home's "Search for friends").
  useEffect(() => {
    if (page) return;
    const focus = () => root.current?.querySelector('input')?.focus();
    window.addEventListener(FOCUS_PEOPLE_SEARCH, focus);
    return () => window.removeEventListener(FOCUS_PEOPLE_SEARCH, focus);
  }, [page]);

  const term = q.trim().replace(/^@/, '');
  useEffect(() => {
    if (term.length < MIN) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setState('loading');
      const res = await apiRequest<{ people: Person[] }>(
        'GET',
        `/api/people/search?q=${encodeURIComponent(term)}`,
      );
      if (ctrl.signal.aborted) return;
      if (res.ok && res.data) {
        setPeople(res.data.people);
        setActive(res.data.people.length > 0 ? 0 : -1);
        setState('done');
      } else {
        setPeople([]);
        setState('error');
      }
    }, WAIT_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [term]);

  const shown = term.length >= MIN && (open || page);
  const go = (p: Person) => {
    setOpen(false);
    router.push(`/profile/${p.handle}`);
  };

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && people.length > 0) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % people.length);
    } else if (e.key === 'ArrowUp' && people.length > 0) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? people.length - 1 : i - 1));
    } else if (e.key === 'Enter' && shown && people[active]) {
      e.preventDefault();
      go(people[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const message =
    term.length < MIN
      ? ''
      : state === 'loading' && people.length === 0
        ? 'Searching…'
        : state === 'error'
          ? 'Search did not work just now. Try again in a moment.'
          : state === 'done' && people.length === 0
            ? 'No one found. People show up here only if they allow it, or if they are your friends.'
            : `${people.length} ${people.length === 1 ? 'person' : 'people'} found`;

  return (
    <div ref={root} className={cn('relative w-full', !page && 'max-w-md')}>
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-text-muted"
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-describedby={statusId}
          aria-activedescendant={shown && people[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="Search people"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          className="min-h-11 w-full rounded-pill border border-border bg-surface py-2 pr-4 pl-11 text-body text-text-primary placeholder:text-text-muted focus:border-focus focus:ring-2 focus:ring-focus/20"
        />
      </label>
      {/* Read out as the results change; visible as the list's last line. */}
      <p id={statusId} aria-live="polite" className="sr-only">
        {message}
      </p>
      {shown && (
        <div
          className={cn(
            'flex flex-col rounded-lg border border-border bg-surface p-1',
            page ? 'mt-3' : 'absolute top-full right-0 left-0 z-40 mt-2 shadow-float',
          )}
        >
          <ul id={listId} role="listbox" aria-label="People" className="flex flex-col">
            {people.map((p, i) => (
              <li
                key={p.handle}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                // Pointer users click; keyboard users use the arrows (the box keeps focus).
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(p)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5',
                  i === active && 'bg-surface-sunken',
                )}
              >
                <Avatar name={p.displayName} tint={p.portraitTint} src={p.portraitUrl} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-semibold text-text-primary">
                    {p.displayName}
                  </span>
                  <span className="block truncate text-caption text-text-secondary">@{p.handle}</span>
                </span>
                {p.friend && (
                  <span className="shrink-0 rounded-pill bg-accent-soft px-2 text-metadata font-semibold text-text-primary">
                    Friend
                  </span>
                )}
              </li>
            ))}
          </ul>
          {people.length === 0 && message && (
            <p aria-hidden="true" className="px-2 py-2 text-caption text-text-secondary">
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
