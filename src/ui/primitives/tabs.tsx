'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../cn';

export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

/** WAI-ARIA tabs with automatic activation: Left/Right/Home/End move and select; only the active tab is in the tab order. */
export function Tabs({ tabs, defaultId, label }: { tabs: TabItem[]; defaultId?: string; label: string }) {
  const [activeId, setActiveId] = useState(defaultId ?? tabs[0]?.id);
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === activeId);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    const target = next === undefined ? undefined : tabs[next];
    if (!target) return;
    e.preventDefault();
    setActiveId(target.id);
    refs.current[target.id]?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto rounded-pill bg-surface-sunken p-1"
      >
        {tabs.map((t) => {
          const selected = t.id === activeId;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`${base}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(t.id)}
              className={cn(
                'min-h-11 flex-1 rounded-pill px-4 text-caption font-semibold whitespace-nowrap transition-colors',
                selected
                  ? 'bg-surface text-text-primary shadow-clay-sm'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== activeId}
          tabIndex={0}
          className="pt-4"
        >
          {t.id === activeId && t.panel}
        </div>
      ))}
    </div>
  );
}
