'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { cn } from '../cn';
import { useDismiss } from './use-dismiss';

export interface DropdownItem {
  id: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>;
  onClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  'aria-expanded': boolean;
  'aria-controls': string;
  'aria-haspopup': 'menu';
}

/**
 * Action menu (WAI-ARIA menu button): ArrowUp/Down, Home/End move focus, Enter/Space activate,
 * Escape closes and restores focus to the trigger, Tab closes.
 */
export function Dropdown({
  trigger,
  items,
  label,
  align = 'start',
}: {
  trigger: (props: MenuTriggerProps, state: { open: boolean }) => ReactNode;
  items: DropdownItem[];
  label: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState(0);
  const menuId = useId();

  const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);
  useDismiss(open, [rootRef], close);

  // Keep the open menu on screen: nudge it sideways off either edge, and open it upwards when the space below
  // (above the phone tab bar) is too short. Styles are set directly so the first paint is already in place.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || !menu) return;
    menu.style.translate = '';
    menu.style.top = '';
    menu.style.bottom = '';
    const gap = 8;
    const vw = document.documentElement.clientWidth;
    const r = menu.getBoundingClientRect();
    let dx = 0;
    if (r.right > vw - gap) dx = vw - gap - r.right;
    if (r.left + dx < gap) dx = gap - r.left;
    if (dx) menu.style.translate = `${dx}px 0`;
    const floor = window.innerHeight - (window.matchMedia('(min-width: 48rem)').matches ? gap : 104);
    const triggerTop = triggerRef.current?.getBoundingClientRect().top ?? r.top;
    if (r.bottom > floor && triggerTop - r.height - gap > gap) {
      menu.style.top = 'auto';
      menu.style.bottom = '100%';
    }
  }, [open]);

  useEffect(() => {
    if (open) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  function openAt(first: boolean) {
    setFocusIndex(first ? (enabled[0] ?? 0) : (enabled[enabled.length - 1] ?? 0));
    setOpen(true);
  }

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      openAt(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(false);
    }
  }

  function onMenuKey(e: KeyboardEvent<HTMLDivElement>) {
    const pos = enabled.indexOf(focusIndex);
    const move = (next: number | undefined) => {
      if (next === undefined) return;
      e.preventDefault();
      setFocusIndex(next);
    };
    if (e.key === 'ArrowDown') move(enabled[(pos + 1) % enabled.length]);
    else if (e.key === 'ArrowUp') move(enabled[(pos - 1 + enabled.length) % enabled.length]);
    else if (e.key === 'Home') move(enabled[0]);
    else if (e.key === 'End') move(enabled[enabled.length - 1]);
    else if (e.key === 'Tab') close(false);
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      {trigger(
        {
          ref: triggerRef,
          onClick: () => (open ? close() : openAt(true)),
          onKeyDown: onTriggerKey,
          'aria-expanded': open,
          'aria-controls': menuId,
          'aria-haspopup': 'menu',
        },
        { open },
      )}
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute top-full z-30 my-2 flex min-w-52 flex-col rounded-lg bg-surface-raised p-1.5 shadow-float',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={i === focusIndex ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                'min-h-11 rounded-md px-3 text-left text-body hover:bg-surface-sunken disabled:opacity-50',
                item.danger ? 'text-danger' : 'text-text-primary',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
