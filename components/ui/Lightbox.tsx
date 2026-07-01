"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { ICON_LG, ICON_STROKE } from "@/components/ui/icon";
import { LoadingSpinner } from "@/components/ui/Skeleton";

export type LightboxImage = {
  src: string;
  alt: string;
  caption?: string;
};

export function useLightbox() {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<{ images: LightboxImage[]; index: number } | null>(null);

  const openSingle = useCallback((image: LightboxImage, trigger?: HTMLElement | null) => {
    if (!image.src) return;
    triggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
    setState({ images: [image], index: 0 });
  }, []);

  const openGallery = useCallback(
    (images: LightboxImage[], index: number, trigger?: HTMLElement | null) => {
      const valid = images.filter((item) => item.src);
      if (!valid.length) return;
      triggerRef.current = trigger ?? (document.activeElement as HTMLElement | null);
      const clamped = Math.max(0, Math.min(index, valid.length - 1));
      setState({ images: valid, index: clamped });
    },
    [],
  );

  const close = useCallback(() => {
    setState(null);
    requestAnimationFrame(() => {
      triggerRef.current?.focus();
      triggerRef.current = null;
    });
  }, []);

  return { state, openSingle, openGallery, close };
}

const clickableImageClass =
  "cursor-pointer transition-[transform,box-shadow] duration-150 hover:scale-[1.02] hover:ring-1 hover:ring-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

interface LightboxImageButtonProps {
  src: string;
  alt: string;
  caption?: string;
  gallery?: LightboxImage[];
  galleryIndex?: number;
  onOpenGallery: (images: LightboxImage[], index: number, trigger: HTMLElement) => void;
  onOpenSingle?: (image: LightboxImage, trigger: HTMLElement) => void;
  className?: string;
  imageClassName?: string;
  children?: ReactNode;
}

export function LightboxImageButton({
  src,
  alt,
  caption,
  gallery,
  galleryIndex = 0,
  onOpenGallery,
  onOpenSingle,
  className = "",
  imageClassName = "h-full w-full object-cover",
  children,
}: LightboxImageButtonProps) {
  if (!src) return children ?? null;

  return (
    <button
      type="button"
      className={`group block overflow-hidden ${clickableImageClass} ${className}`}
      aria-label={`View larger: ${alt}`}
      onClick={(e) => {
        e.stopPropagation();
        const trigger = e.currentTarget;
        if (gallery && gallery.length > 0) {
          onOpenGallery(gallery, galleryIndex, trigger);
        } else if (onOpenSingle) {
          onOpenSingle({ src, alt, caption }, trigger);
        } else {
          onOpenGallery([{ src, alt, caption }], 0, trigger);
        }
      }}
    >
      {children ?? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className={imageClassName} draggable={false} />
      )}
    </button>
  );
}

interface LightboxProps {
  state: { images: LightboxImage[]; index: number } | null;
  onClose: () => void;
}

function LightboxSpinner() {
  return <LoadingSpinner label="Loading image" />;
}

export function Lightbox({ state, onClose }: LightboxProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!state) return;
    setIndex(state.index);
    setLoaded(false);
  }, [state]);

  useEffect(() => {
    if (!state) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => closeRef.current?.focus(), 0);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [state]);

  const goPrev = useCallback(() => {
    if (!state || state.images.length <= 1) return;
    setIndex((i) => Math.max(0, i - 1));
    setLoaded(false);
  }, [state]);

  const goNext = useCallback(() => {
    if (!state || state.images.length <= 1) return;
    setIndex((i) => Math.min(state.images.length - 1, i + 1));
    setLoaded(false);
  }, [state]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (!state || state.images.length <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [goNext, goPrev, onClose, state],
  );

  if (!mounted || !state) return null;

  const current = state.images[index];
  const hasGallery = state.images.length > 1;
  const atStart = index === 0;
  const atEnd = index === state.images.length - 1;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Close image viewer"
        onClick={onClose}
      />

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        className="focus-ring studio-icon-btn absolute right-4 top-4 z-10 !min-h-10 !min-w-10 !rounded-full !border-border/60 !bg-surface/90 backdrop-blur-sm"
        aria-label="Close"
      >
        <X className={ICON_LG} strokeWidth={ICON_STROKE} aria-hidden />
      </button>

      {hasGallery ? (
        <>
          <button
            type="button"
            disabled={atStart}
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="focus-ring studio-icon-btn absolute left-4 top-1/2 z-10 !min-h-11 !min-w-11 -translate-y-1/2 !rounded-full !border-border/60 !bg-surface/90 backdrop-blur-sm disabled:pointer-events-none disabled:opacity-30"
            aria-label="Previous image"
          >
            <ChevronLeft className={ICON_LG} strokeWidth={ICON_STROKE} aria-hidden />
          </button>
          <button
            type="button"
            disabled={atEnd}
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="focus-ring studio-icon-btn absolute right-4 top-1/2 z-10 !min-h-11 !min-w-11 -translate-y-1/2 !rounded-full !border-border/60 !bg-surface/90 backdrop-blur-sm disabled:pointer-events-none disabled:opacity-30"
            aria-label="Next image"
          >
            <ChevronRight className={ICON_LG} strokeWidth={ICON_STROKE} aria-hidden />
          </button>
        </>
      ) : null}

      <div
        className="relative z-[1] flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p id={titleId} className="sr-only">
          {current.caption ?? current.alt}
        </p>

        <div className="relative flex min-h-[12rem] min-w-[12rem] items-center justify-center">
          {!loaded ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <LightboxSpinner />
            </div>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.src}
            src={current.src}
            alt={current.alt}
            className={`max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl transition-opacity duration-200 ${
              loaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
            draggable={false}
          />
        </div>

        {hasGallery || current.caption ? (
          <p className="rounded-full border border-border/50 bg-surface/90 px-3 py-1 text-xs text-muted backdrop-blur-sm">
            {hasGallery ? (
              <>
                {current.caption ?? current.alt}
                <span className="mx-2 text-border">·</span>
                {index + 1} of {state.images.length}
              </>
            ) : (
              (current.caption ?? current.alt)
            )}
          </p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
