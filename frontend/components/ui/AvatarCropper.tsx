"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faMagnifyingGlassMinus, faMagnifyingGlassPlus } from "@fortawesome/free-solid-svg-icons";

/** Matches the server's avatar size, so the upload needs no further cropping. */
const OUTPUT_SIZE = 512;
const MIN_SOURCE_SIDE = 128;
const MAX_ZOOM = 4;
const PAN_STEP = 14;
const PAN_STEP_FAST = 48;
const ZOOM_STEP = 0.1;

type AvatarCropperProps = {
  file: File;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
  /**
   * The browser could not decode the file, or it is too small to crop. The
   * original is uploaded untouched so the server's own validation produces the
   * message (a HEIC photo, for instance, gets camera-settings guidance).
   */
  onFallback: (original: File) => void;
};

const subscribeToNothing = () => () => {};

export default function AvatarCropper({ file, onCancel, onConfirm, onFallback }: AvatarCropperProps) {
  // Portals need a DOM, so the modal renders only after hydration.
  const mounted = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Null until the user pans: the centred position is derived, not stored.
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Live pointers, so two fingers can pinch to zoom.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let created: ImageBitmap | undefined;

    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((image) => {
        created = image;
        if (cancelled) return image.close();
        if (Math.min(image.width, image.height) < MIN_SOURCE_SIDE) {
          image.close();
          return onFallback(file);
        }
        setZoom(1);
        setOffset(null);
        setBitmap(image);
      })
      .catch(() => {
        if (!cancelled) onFallback(file);
      });

    return () => {
      cancelled = true;
      created?.close();
    };
  }, [file, onFallback]);

  // The frame is responsive, so its size is measured rather than assumed.
  // Focusing it here (once the photo is actually ready to move) puts keyboard
  // control one Tab away from nowhere: it works the instant the dialog opens,
  // with no hunting through the zoom buttons first.
  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => setViewport(entry.contentRect.width));
    observer.observe(node);
    setViewport(node.getBoundingClientRect().width);
    node.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, [bitmap]);

  /** Smallest scale that still covers the frame, so no gap can ever show. */
  const baseScale = bitmap && viewport ? Math.max(viewport / bitmap.width, viewport / bitmap.height) : 1;
  const scale = baseScale * zoom;

  // Where the image sits when it has not been dragged yet.
  const centred = useMemo(
    () => (bitmap && viewport
      ? { x: (viewport - bitmap.width * scale) / 2, y: (viewport - bitmap.height * scale) / 2 }
      : { x: 0, y: 0 }),
    [bitmap, viewport, scale],
  );
  const position = offset ?? centred;

  const clamp = useCallback(
    (x: number, y: number, atScale: number) => {
      if (!bitmap || !viewport) return { x, y };
      const width = bitmap.width * atScale;
      const height = bitmap.height * atScale;
      return {
        x: width <= viewport ? (viewport - width) / 2 : Math.min(0, Math.max(viewport - width, x)),
        y: height <= viewport ? (viewport - height) / 2 : Math.min(0, Math.max(viewport - height, y)),
      };
    },
    [bitmap, viewport],
  );

  // Drawing to a canvas rather than transforming an <img> keeps the preview and
  // the exported crop driven by exactly the same numbers.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || !viewport) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewport * dpr;
    canvas.height = viewport * dpr;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, viewport, viewport);
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, position.x, position.y, bitmap.width * scale, bitmap.height * scale);
  }, [bitmap, viewport, position, scale]);

  /** Zooms about the centre of the frame, so the subject does not drift. */
  const applyZoom = useCallback(
    (nextZoom: number) => {
      const clampedZoom = Math.min(MAX_ZOOM, Math.max(1, nextZoom));
      if (!bitmap || !viewport) return setZoom(clampedZoom);

      setOffset((current) => {
        const from = current ?? centred;
        const centreX = (viewport / 2 - from.x) / (baseScale * zoom);
        const centreY = (viewport / 2 - from.y) / (baseScale * zoom);
        const nextScale = baseScale * clampedZoom;
        return clamp(viewport / 2 - centreX * nextScale, viewport / 2 - centreY * nextScale, nextScale);
      });
      setZoom(clampedZoom);
    },
    [bitmap, viewport, baseScale, zoom, clamp, centred],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const points = [...pointers.current.values()];

    if (points.length >= 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (!pinchStart.current) {
        pinchStart.current = { distance, zoom };
      } else if (pinchStart.current.distance > 0) {
        applyZoom(pinchStart.current.zoom * (distance / pinchStart.current.distance));
      }
      return;
    }

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    setOffset((current) => {
      const from = current ?? centred;
      return clamp(from.x + dx, from.y + dy, scale);
    });
  };

  const endPointer = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const onWheel = (event: React.WheelEvent) => {
    applyZoom(zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
  };

  /**
   * Full keyboard operation of the frame itself: arrows pan (Shift for a
   * bigger step), +/- zoom, Home recentres, Enter confirms. The frame is a
   * plain focusable div rather than a range input because panning is
   * two-dimensional - a single input has no natural mapping for that.
   */
  const onFrameKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? PAN_STEP_FAST : PAN_STEP;
    const pan = (dx: number, dy: number) => {
      event.preventDefault();
      setOffset((current) => {
        const from = current ?? centred;
        return clamp(from.x + dx, from.y + dy, scale);
      });
    };

    switch (event.key) {
      case "ArrowLeft":
        return pan(step, 0);
      case "ArrowRight":
        return pan(-step, 0);
      case "ArrowUp":
        return pan(0, step);
      case "ArrowDown":
        return pan(0, -step);
      case "+":
      case "=":
        event.preventDefault();
        return applyZoom(zoom + ZOOM_STEP);
      case "-":
      case "_":
        event.preventDefault();
        return applyZoom(zoom - ZOOM_STEP);
      case "Home":
        event.preventDefault();
        setZoom(1);
        return setOffset(null);
      case "Enter":
        event.preventDefault();
        return confirm();
      default:
        return undefined;
    }
  };

  const confirm = () => {
    if (!bitmap || !viewport) return;
    setBusy(true);

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return setBusy(false);

    // The frame maps straight back onto the source image.
    const sourceSize = viewport / scale;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      -position.x / scale,
      -position.y / scale,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    );

    canvas.toBlob(
      (blob) => {
        setBusy(false);
        if (!blob) return onFallback(file);
        const base = file.name.replace(/\.[^.]+$/, "") || "avatar";
        onConfirm(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, busy]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => !busy && onCancel()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-title"
      >
        <motion.div
          className="glass-card my-auto w-full max-w-md p-5 sm:p-6"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="crop-title" className="text-base font-semibold sm:text-lg">
            Position your photo
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Drag to move, pinch or use the slider to zoom. Everything inside the circle is kept.
            The frame also takes the keyboard: arrow keys move the photo, + and - zoom, Home
            recentres, and Enter confirms.
          </p>

          <div
            ref={frameRef}
            tabIndex={0}
            role="application"
            aria-label="Photo crop frame. Use arrow keys to move the photo, plus and minus to zoom, Home to recentre, and Enter to confirm."
            onKeyDown={onFrameKeyDown}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={onWheel}
            className="relative mx-auto mt-4 aspect-square w-full max-w-[20rem] touch-none select-none overflow-hidden rounded-xl bg-[rgba(3,8,17,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(56,189,248,0.7)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--card)]"
          >
            <canvas
              ref={canvasRef}
              style={{ width: viewport || "100%", height: viewport || "100%" }}
              className="block cursor-grab active:cursor-grabbing"
            />
            <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/70 shadow-[0_0_0_9999px_rgba(3,8,17,0.72)]" />
            {!bitmap && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">
                Loading photo...
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => applyZoom(zoom - 0.25)}
              className="text-[var(--muted)] transition hover:text-white"
            >
              <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              aria-label="Zoom"
              onChange={(event) => applyZoom(Number(event.target.value))}
              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border)] accent-[var(--accent)]"
            />
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => applyZoom(zoom + 0.25)}
              className="text-[var(--muted)] transition hover:text-white"
            >
              <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={!bitmap || busy}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-white transition hover:bg-[#2a4fb5] disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
              Use this photo
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
