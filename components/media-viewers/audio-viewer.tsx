"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AudioViewerProps {
  src: string;
  fileName: string;
}

export function AudioViewer({ src, fileName }: AudioViewerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  }, []);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onDuration = () => setDuration(a.duration);
    const onEnded = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onDuration);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onDuration);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const a = audioRef.current;
      if (!a) return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowLeft") a.currentTime = Math.max(0, a.currentTime - 5);
      if (e.key === "ArrowRight") a.currentTime = Math.min(duration, a.currentTime + 5);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, duration]);

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (audioRef.current) audioRef.current.currentTime = pct * duration;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <audio ref={audioRef} src={src} preload="metadata" onError={() => setLoadError(true)} />

      {loadError ? (
        <div className="text-center text-muted-foreground">
          <Music className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">Audio tidak dapat diputar</p>
        </div>
      ) : (
        <>
          <div className="w-full max-w-md mb-8">
            <div className="flex items-end justify-center gap-[2px] h-24 mb-4">
              {Array.from({ length: 48 }).map((_, i) => {
                const height = Math.sin(i * 0.3 + currentTime * 2) * 40 + 50;
                const isActive = (i / 48) * 100 <= progress;
                return (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 rounded-full transition-all duration-100",
                      isActive ? "bg-accent" : "bg-border/50"
                    )}
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>

            <div className="relative h-2 bg-border/30 rounded-full cursor-pointer group" onClick={handleSeek}>
              <div className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all" style={{ width: `${progress}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-accent shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progress}% - 8px)` }}
              />
            </div>

            <div className="flex justify-between mt-1 text-xs text-muted-foreground font-mono">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => audioRef.current && (audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10))}>
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-14 w-14 rounded-full"
              onClick={togglePlay}
            >
              {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => audioRef.current && (audioRef.current.currentTime = Math.min(duration, audioRef.current.currentTime + 10))}>
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (audioRef.current) { audioRef.current.muted = !audioRef.current.muted; setMuted(audioRef.current.muted); } }}>
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (audioRef.current) { audioRef.current.volume = v; audioRef.current.muted = v === 0; }
                setVolume(v);
                setMuted(v === 0);
              }}
              className="w-24 h-1 accent-accent cursor-pointer"
            />
          </div>

          <p className="mt-4 text-sm text-muted-foreground truncate max-w-xs">{fileName}</p>
        </>
      )}
    </div>
  );
}
