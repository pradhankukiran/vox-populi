"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, Download, AudioLines } from "lucide-react";
import WaveSurfer from "wavesurfer.js";

import { Button } from "@/components/ui/button";

type Props = {
  audioUrl: string | null;
  filename: string;
};

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PlayerBar({ audioUrl, filename }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      url: audioUrl,
      waveColor: "#d4d4d8",
      progressColor: "#18181b",
      cursorColor: "#18181b",
      cursorWidth: 2,
      height: 72,
      barWidth: 2,
      barGap: 2,
      barRadius: 1,
      normalize: true,
    });
    wsRef.current = ws;

    ws.on("ready", () => setDuration(ws.getDuration()));
    ws.on("audioprocess", () => setCurrent(ws.getCurrentTime()));
    ws.on("seeking", () => setCurrent(ws.getCurrentTime()));
    ws.on("play", () => setPlaying(true));
    ws.on("pause", () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [audioUrl]);

  const empty = !audioUrl;
  const displayPlaying = empty ? false : playing;
  const displayCurrent = empty ? 0 : current;
  const displayDuration = empty ? 0 : duration;

  const toggle = () => {
    wsRef.current?.playPause();
  };

  return (
    <footer className="h-32 border-t border-border bg-card px-6 flex items-center gap-5">
      <Button
        size="icon"
        variant={empty ? "ghost" : "default"}
        onClick={toggle}
        disabled={empty}
        className="size-14 shrink-0 rounded-full"
        aria-label={displayPlaying ? "Pause" : "Play"}
      >
        {displayPlaying ? (
          <Pause className="size-6" />
        ) : (
          <Play className="size-6 translate-x-[1px]" />
        )}
      </Button>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <AudioLines className="size-4" />
          <span className="truncate">
            {empty ? "no output yet — generate to load a clip" : filename}
          </span>
        </div>
        <div className="relative flex items-center gap-3">
          <span className="text-sm font-mono text-muted-foreground tabular-nums w-12 text-right">
            {formatTime(displayCurrent)}
          </span>
          <div
            ref={containerRef}
            className="flex-1 h-[72px] rounded-md bg-muted/40 border border-border"
          />
          <span className="text-sm font-mono text-muted-foreground tabular-nums w-12">
            {formatTime(displayDuration)}
          </span>
        </div>
      </div>

      <Button
        size="icon"
        variant="outline"
        disabled={empty}
        asChild={!empty}
        className="size-14 shrink-0"
        aria-label="Download"
      >
        {empty ? (
          <Download className="size-6" />
        ) : (
          <a href={audioUrl ?? "#"} download={filename}>
            <Download className="size-6" />
          </a>
        )}
      </Button>
    </footer>
  );
}
