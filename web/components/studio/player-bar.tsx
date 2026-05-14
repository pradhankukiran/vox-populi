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
      waveColor: "#52525b",
      progressColor: "#fafafa",
      cursorColor: "#fafafa",
      cursorWidth: 1,
      height: 56,
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
    <footer className="h-24 border-t border-border/60 bg-card/40 backdrop-blur px-4 flex items-center gap-4">
      <Button
        size="icon"
        variant={empty ? "ghost" : "default"}
        onClick={toggle}
        disabled={empty}
        className="size-10 shrink-0 rounded-full"
        aria-label={displayPlaying ? "Pause" : "Play"}
      >
        {displayPlaying ? (
          <Pause className="size-4" />
        ) : (
          <Play className="size-4 translate-x-[1px]" />
        )}
      </Button>

      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80">
          <AudioLines className="size-3" />
          <span className="truncate">
            {empty ? "no output yet — generate to load a clip" : filename}
          </span>
        </div>
        <div className="relative flex items-center gap-3">
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-10 text-right">
            {formatTime(displayCurrent)}
          </span>
          <div
            ref={containerRef}
            className="flex-1 h-14 rounded-md bg-background/40 border border-border/40"
          />
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-10">
            {formatTime(displayDuration)}
          </span>
        </div>
      </div>

      <Button
        size="icon"
        variant="outline"
        disabled={empty}
        asChild={!empty}
        className="size-10 shrink-0"
        aria-label="Download"
      >
        {empty ? (
          <Download className="size-4" />
        ) : (
          <a href={audioUrl ?? "#"} download={filename}>
            <Download className="size-4" />
          </a>
        )}
      </Button>
    </footer>
  );
}
