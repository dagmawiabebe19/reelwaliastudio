"use client";

import { useRef } from "react";

interface VideoTakePlayerProps {
  src: string;
  isPortrait: boolean;
  fullWidth?: boolean;
  hasAudio?: boolean;
}

export function VideoTakePlayer({
  src,
  isPortrait,
  fullWidth = false,
  hasAudio = false,
}: VideoTakePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const widthClass = fullWidth ? "w-full" : isPortrait ? "w-48" : "w-80";

  return (
    <div className={`flex flex-col gap-3 ${widthClass}`}>
      <video
        ref={videoRef}
        src={src}
        controls
        muted={!hasAudio}
        playsInline
        className={`w-full rounded-lg border border-border bg-black object-cover ${
          isPortrait ? "aspect-[9/16]" : "aspect-video"
        }`}
      />
      {hasAudio ? (
        <p className="text-center text-[10px] tracking-wide text-muted">Native audio</p>
      ) : null}
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={0}
        className="w-full accent-accent"
        onChange={(e) => {
          const video = videoRef.current;
          if (!video || !video.duration) return;
          video.currentTime = (Number(e.target.value) / 100) * video.duration;
        }}
        aria-label="Scrub timeline"
      />
      <div className="flex gap-1 overflow-x-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`shrink-0 rounded bg-background border border-border ${
              isPortrait ? "h-10 w-7" : "h-7 w-12"
            }`}
            style={{
              backgroundImage: `url(${src})`,
              backgroundSize: "cover",
              backgroundPosition: `${(i / 7) * 100}% center`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
