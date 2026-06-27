"use client";

interface VideoTakePlayerProps {
  src: string;
  isPortrait: boolean;
  fullWidth?: boolean;
}

export function VideoTakePlayer({ src, isPortrait, fullWidth = false }: VideoTakePlayerProps) {
  const widthClass = fullWidth ? "w-full" : isPortrait ? "w-48" : "w-80";

  return (
    <div className={`flex flex-col gap-3 ${widthClass}`}>
      <video
        src={src}
        controls
        className={`w-full rounded-lg border border-border bg-black object-cover ${
          isPortrait ? "aspect-[9/16]" : "aspect-video"
        }`}
      />
      <input
        type="range"
        min={0}
        max={100}
        defaultValue={0}
        className="w-full accent-accent"
        onChange={(e) => {
          const video = e.currentTarget.previousElementSibling as HTMLVideoElement | null;
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
