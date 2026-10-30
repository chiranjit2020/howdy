'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Img } from '../art/img';
import { cn } from '../cn';
import { CloseIcon } from '../icons';
import { Button } from './button';
import { IconButton } from './icon-button';

type Placement = 'center' | 'bottom' | 'right';

const PLACEMENT: Record<Placement, string> = {
  center: 'm-auto w-[min(92vw,30rem)] rounded-xl',
  // Bottom sheet on small screens — thumb reachable.
  bottom:
    'mx-auto mt-auto mb-0 w-full max-w-none rounded-t-xl rounded-b-none sm:mb-auto sm:w-[min(92vw,30rem)] sm:rounded-xl',
  right: 'my-0 ml-auto mr-0 h-dvh max-h-none w-[min(92vw,26rem)] rounded-l-xl rounded-r-none',
};

let scrollLocks = 0;
function lockScroll(lock: boolean) {
  scrollLocks += lock ? 1 : -1;
  document.documentElement.classList.toggle('overflow-hidden', scrollLocks > 0);
}

interface BaseProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  placement?: Placement;
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

/**
 * Modal built on the native <dialog>: the browser provides the focus trap, inert background,
 * Escape handling and focus restoration. We add backdrop-click, scroll lock and labelling.
 */
function DialogBase({
  open,
  onClose,
  title,
  description,
  children,
  placement = 'center',
  role = 'dialog',
  className,
}: BaseProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // React's `autoFocus` runs while the <dialog> is still closed (nothing is focusable), so the browser would
      // pick the first control (the Close button). Honour an explicit choice instead — e.g. the safe "Cancel".
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
      lockScroll(true);
      return () => {
        if (el.open) el.close();
        lockScroll(false);
      };
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        // A click on the ::backdrop targets the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'max-h-[90dvh] overflow-auto bg-surface p-0 text-text-primary shadow-float backdrop:bg-transparent',
        PLACEMENT[placement],
        className,
      )}
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="text-heading text-text-primary">
              {title}
            </h2>
            <IconButton label="Close" onClick={onClose} className="-mt-2 -mr-2">
              <CloseIcon />
            </IconButton>
          </div>
          {description && (
            <p id={descId} className="text-body text-text-secondary">
              {description}
            </p>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}

/** Centered modal (bottom sheet on phones). */
export function Modal(props: ModalProps) {
  return <DialogBase {...props} placement="center" />;
}

/**
 * A photo on its own, full screen: a near-black backdrop, the photo as large as it fits, a × in the corner. Esc, the ×
 * or a click anywhere outside the photo closes it. A native <dialog>, so focus is trapped and returned for free.
 */
export function PhotoViewer({
  open,
  onClose,
  src,
  width,
  height,
  alt,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  width: number;
  height: number;
  alt: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !open || el.open) return;
    el.showModal();
    lockScroll(true);
    return () => {
      if (el.open) el.close();
      lockScroll(false);
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={alt}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // the dark area around the photo
      }}
      className="m-0 h-dvh max-h-none w-dvw max-w-none place-items-center bg-scrim p-4 backdrop:bg-transparent open:grid"
    >
      {open && (
        <>
          <Img
            src={src}
            width={width}
            height={height}
            alt={alt}
            loading="eager"
            className="h-auto max-h-[calc(100dvh-2rem)] w-auto max-w-full rounded-md"
          />
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 grid size-11 place-items-center rounded-pill text-on-scrim hover:bg-on-scrim/15"
          >
            <CloseIcon className="size-6" />
          </button>
        </>
      )}
    </dialog>
  );
}

/** Side panel (right) or bottom sheet. */
export function Drawer({ side = 'right', ...props }: ModalProps & { side?: 'right' | 'bottom' }) {
  return <DialogBase {...props} placement={side} />;
}

/** Modal with a standard footer of actions. */
export function Dialog({ actions, children, ...props }: ModalProps & { actions: ReactNode }) {
  return (
    <DialogBase {...props} placement="center">
      {children}
      <div className="flex flex-wrap justify-end gap-3">{actions}</div>
    </DialogBase>
  );
}

export interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions use the danger style. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** role="alertdialog" confirmation for irreversible actions (e.g. Burn the Deed). Cancel is the safe default. */
export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <DialogBase open={open} onClose={onCancel} title={title} description={description} role="alertdialog">
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onCancel} data-autofocus>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </DialogBase>
  );
}
