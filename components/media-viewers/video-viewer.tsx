"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize2, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/system/spinner";

interface VideoViewerProps {
  src: string;
  fileName: string;
}

export function VideoViewer({ src, fileName }: VideoViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const controlsTimer = useRef<NodeJS.Timeout | null>(null);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}` : `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    const onDuration = () => setDuration(v.duration);
    const onBuffer = () => {
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onEnded = () => setPlaying(false);
    const onCanPlay = () => { setLoading(false); setLoadError(false); };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onDuration);
    v.addEventListener("progress", onBuffer);
    v.addEventListener("ended", onEnded);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("playing", onPlaying);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onDuration);
      v.removeEventListener("progress", onBuffer);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("playing", onPlaying);
    };
  }, [retryKey]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const v = videoRef.current;
      if (!v) return;
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 10);
      if (e.key === "ArrowRight") v.currentTime = Math.min(v.duration, v.currentTime + 10);
      if (e.key === "ArrowUp") { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); setVolume(v.volume); }
      if (e.key === "ArrowDown") { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); setVolume(v.volume); }
      if (e.key === "m") { v.muted = !v.muted; setMuted(v.muted); }
      if (e.key === "f") {
        if (document.fullscreenElement) document.exitFullscreen();
        else containerRef.current?.requestFullscreen();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay]);

  function handleMouseMove() {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => { if (playing) setShowControls(false); }, 3000);
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) videoRef.current.currentTime = pct * duration;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-full bg-black group"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => playing && setShowControls(false)}
    >
      {/* Video */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {loadError ? (
          <div className="text-center text-white/60 p-8">
            <Play className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-3">Video tidak dapat diputar</p>
            <Button variant="secondary" size="sm" onClick={() => { setLoadError(false); setLoading(true); setRetryKey((k) => k + 1); }}>
              Coba lagi
            </Button>
          </div>
        ) : (
          <>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <Spinner size="lg" style={{ ["--accent" as string]: "#fff" }} />
              </div>
            )}
            <video
              key={retryKey}
              ref={videoRef}
              src={src}
              className="max-w-full max-h-full"
              playsInline
              preload="auto"
              onClick={togglePlay}
              onError={() => { setLoadError(true); setLoading(false); }}
            />
          </>
        )}
      </div>

      {/* Play overlay when paused */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center">
            <Play className="h-8 w-8 text-white ml-1" fill="white" />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-10 pb-3 px-4 transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Progress Bar */}
        <div
          className="relative h-1.5 mb-3 bg-white/20 rounded-full cursor-pointer group/progress hover:h-2.5 transition-all"
          onClick={handleSeek}
        >
          <div className="absolute inset-y-0 left-0 bg-white/30 rounded-full" style={{ width: `${bufferPct}%` }} />
          <div className="absolute inset-y-0 left-0 bg-accent rounded-full" style={{ width: `${progress}%` }} />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-accent shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 7px)` }}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:text-white" onClick={togglePlay}>
            {playing ? <Pause className="h-4 w-4" fill="white" /> : <Play className="h-4 w-4" fill="white" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => videoRef.current && (videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10))}>
            <SkipBack className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => videoRef.current && (videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10))}>
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs text-white/80 font-mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => { if (videoRef.current) { videoRef.current.muted = !videoRef.current.muted; setMuted(videoRef.current.muted); } }}>
              {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </Button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (videoRef.current) { videoRef.current.volume = v; videoRef.current.muted = v === 0; }
                setVolume(v);
                setMuted(v === 0);
              }}
              className="w-16 h-1 accent-accent cursor-pointer"
            />
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-white/70 hover:text-white" onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else containerRef.current?.requestFullscreen();
          }}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
