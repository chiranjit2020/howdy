'use client';

import { useEffect, useRef } from 'react';

/** The signed upload the server hands back (POST to a photo endpoint). */
export interface SignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/**
 * Send a file to storage with XHR rather than fetch: only XHR reports upload progress. `onProgress` gets 0..1. Resolves
 * true when storage said yes, false when it refused; rejects when it could not be reached.
 */
export function putWithProgress(upload: SignedUpload, file: Blob, onProgress: (share: number) => void) {
  return new Promise<boolean>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.url);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => reject(new Error('network'));
    xhr.onabort = () => reject(new Error('aborted'));
    xhr.send(file);
  });
}

/** If the new photo never reports loaded (a dropped connection), stop waiting after this, so nothing stays locked. */
const LOAD_WAIT_MS = 10_000;

/**
 * The last step of a photo upload. While `waiting`, the refreshed page should bring a new address (`current` differs from
 * `before`); fetch it in the background and call `onArrived` once it has loaded, so the local preview can be swapped for
 * it without a blank flash. Also calls it if the image fails, if it takes over 10 s, or if no new address comes within
 * 20 s: the photo is saved on the server either way, and the form must not stay locked.
 */
export function usePhotoArrival(
  waiting: boolean,
  before: string | null | undefined,
  current: string | null,
  onArrived: () => void,
) {
  const arrived = useRef(onArrived);
  useEffect(() => {
    arrived.current = onArrived;
  });

  const next = waiting && current !== before ? current : undefined;
  useEffect(() => {
    if (next === undefined) return;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      arrived.current();
    };
    const timer = window.setTimeout(done, LOAD_WAIT_MS);
    if (next === null) done();
    else {
      const img = new Image();
      img.onload = done;
      img.onerror = done; // the real <img> shows its own fallback; nothing must stay locked
      img.src = next;
    }
    return () => {
      settled = true;
      window.clearTimeout(timer);
    };
  }, [next]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => arrived.current(), LOAD_WAIT_MS * 2);
    return () => window.clearTimeout(timer);
  }, [waiting]);
}
