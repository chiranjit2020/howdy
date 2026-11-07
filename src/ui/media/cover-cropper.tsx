'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { FormMessage } from '../auth/form-parts';
import { Button } from '../primitives';

/** How far in you may zoom, as a multiple of "just fills the frame". */
const MAX_ZOOM = 3;
/** Arrow keys move the photo this far (in output pixels); with Shift, four times as far. */
const KEY_STEP = 24;

interface Pos {
  cx: number;
  cy: number;
}

/**
 * Place a photo in a wide frame before it is uploaded: drag it (mouse, finger or arrow keys) and zoom with the slider.
 * The photo always fills the frame, so there is never an empty edge. `onSave` gets a JPEG of exactly what the frame
 * shows, at `width` × `height`, so the server's own crop to that shape changes nothing.
 *
 * Drawn on a canvas: moving an <img> would need an inline style, which the CSP forbids. The browser applies the phone's
 * "rotated" flag when it decodes the photo; camera and location data are not copied into the result.
 */
export function CoverCropper({
  file,
  width,
  height,
  onCancel,
  onSave,
}: {
  file: File;
  width: number;
  height: number;
  onCancel: () => void;
  onSave: (photo: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [img, setImg] = useState<ImageBitmap | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState<Pos>({ cx: width / 2, cy: height / 2 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    let bitmap: ImageBitmap | null = null;
    createImageBitmap(file)
      .then((b) => {
        bitmap = b;
        if (live) setImg(b);
        else b.close();
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      bitmap?.close();
    };
  }, [file]);

  /** The drawn size at zoom `z`: the smallest scale that fills the frame both ways, times `z`. */
  const size = useCallback(
    (z: number) => {
      if (!img) return { dw: width, dh: height };
      const base = Math.max(width / img.width, height / img.height);
      return { dw: img.width * base * z, dh: img.height * base * z };
    },
    [img, width, height],
  );

  /** Keep the photo covering the frame: its centre may only move as far as its overflow allows. */
  const clamp = useCallback(
    (p: Pos, z: number): Pos => {
      const { dw, dh } = size(z);
      return {
        cx: Math.min(dw / 2, Math.max(width - dw / 2, p.cx)),
        cy: Math.min(dh / 2, Math.max(height - dh / 2, p.cy)),
      };
    },
    [size, width, height],
  );

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!img) return;
      const { dw, dh } = size(zoom);
      ctx.fillStyle = 'white'; // a transparent PNG would otherwise turn black as a JPEG
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, pos.cx - dw / 2, pos.cy - dh / 2, dw, dh);
    },
    [img, size, zoom, pos, width, height],
  );

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paint(ctx);
  }, [paint]);

  /** Screen pixels to output pixels (the canvas is drawn at full size and shown smaller). */
  const ratio = () => width / (canvas.current?.clientWidth || width);

  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const k = ratio();
    const dx = (e.clientX - d.x) * k;
    const dy = (e.clientY - d.y) * k;
    drag.current = { id: d.id, x: e.clientX, y: e.clientY };
    setPos((p) => clamp({ cx: p.cx + dx, cy: p.cy + dy }, zoom));
  }
  function up(e: PointerEvent<HTMLCanvasElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null;
  }

  /** Zoom around the frame's centre, so what you are looking at stays put. */
  function zoomTo(next: number) {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    setPos((p) =>
      clamp(
        {
          cx: width / 2 + (p.cx - width / 2) * (z / zoom),
          cy: height / 2 + (p.cy - height / 2) * (z / zoom),
        },
        z,
      ),
    );
    setZoom(z);
  }

  function key(e: KeyboardEvent<HTMLCanvasElement>) {
    const step = KEY_STEP * (e.shiftKey ? 4 : 1);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setPos((p) => clamp({ cx: p.cx + m[0], cy: p.cy + m[1] }, zoom));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomTo(zoom + 0.1);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomTo(zoom - 0.1);
    }
  }

  async function save() {
    if (!img) return;
    setSaving(true);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    if (ctx) paint(ctx);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.9));
    setSaving(false);
    if (blob) onSave(blob);
    else setFailed(true);
  }

  if (failed)
    return (
      <div className="flex flex-col gap-3">
        <FormMessage tone="error">We couldn&apos;t open that photo. Try a JPEG, PNG or WebP.</FormMessage>
        <Button variant="secondary" size="sm" className="self-start" onClick={onCancel}>
          Choose another
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <canvas
        ref={canvas}
        width={width}
        height={height}
        tabIndex={0}
        role="img"
        aria-label="Your cover. Drag, or use the arrow keys, to move it; plus and minus zoom."
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className="block aspect-[20/7] w-full cursor-grab touch-none rounded-md bg-surface-sunken outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus active:cursor-grabbing"
      />
      <label className="flex items-center gap-3 text-caption text-text-secondary">
        <span className="shrink-0">Zoom</span>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!img}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-star"
        />
      </label>
      <p className="text-metadata text-text-muted">Drag the photo to choose what shows.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} loading={saving} disabled={!img}>
          Save cover
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
