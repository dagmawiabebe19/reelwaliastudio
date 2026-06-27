"use client";

interface MediaPlayerProps {
  src: string | null;
  className?: string;
}

export function MediaPlayer({ src, className = "" }: MediaPlayerProps) {
  if (!src) {
    return (
      <div
        className={`flex h-10 items-center rounded-md border border-border bg-surface-elevated px-3 text-xs text-muted ${className}`}
      >
        No audio
      </div>
    );
  }

  return (
    <audio controls preload="metadata" src={src} className={`h-10 w-full ${className}`}>
      <track kind="captions" />
    </audio>
  );
}
