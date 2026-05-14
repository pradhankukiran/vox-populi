"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { toast } from "sonner";
import {
  Plus,
  Save,
  History,
  Upload,
  Trash2,
  CircleDot,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlayerBar } from "@/components/studio/player-bar";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

type Gender = "male" | "female";
type Age = "young" | "adult" | "elderly";
type Tone = "gentle" | "cheerful" | "serious" | "melancholy" | "angry";
type Pace = "slow" | "normal" | "fast";
type TabKey = "design" | "controllable" | "ultimate";
type WarmupState = "idle" | "warming" | "ready" | "error";

type VoicePreset = {
  id: string;
  name: string;
  gender: Gender;
  age: Age;
  tone: Tone;
  pace: Pace;
  createdAt: number;
};

type HistoryItem = {
  id: string;
  mode: TabKey;
  text: string;
  audioUrl: string;
  filename: string;
  timestamp: number;
};

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const GENDERS: Gender[] = ["male", "female"];
const AGES: Age[] = ["young", "adult", "elderly"];
const TONES: Tone[] = ["gentle", "cheerful", "serious", "melancholy", "angry"];
const PACES: Pace[] = ["slow", "normal", "fast"];

const TABS: { key: TabKey; label: string; sub: string }[] = [
  { key: "design", label: "Design", sub: "describe a voice" },
  { key: "controllable", label: "Clone", sub: "ref + style" },
  { key: "ultimate", label: "Ultimate", sub: "ref + transcript" },
];

const STORAGE_KEY_VOICES = "vox-populi:voices";
const STORAGE_KEY_HISTORY = "vox-populi:history";
const HISTORY_LIMIT = 12;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatRelative = (timestamp: number): string => {
  const diff = (Date.now() - timestamp) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(timestamp).toLocaleDateString();
};

// --------------------------------------------------------------------------
// Page
// --------------------------------------------------------------------------

export default function Home() {
  // Shared
  const [tab, setTab] = useState<TabKey>("design");
  const [text, setText] = useState("");
  const [cfgValue, setCfgValue] = useState(2.0);
  const [loading, setLoading] = useState(false);

  // Warmup
  const [warmupState, setWarmupState] = useState<WarmupState>("idle");
  const [warmupOpen, setWarmupOpen] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Output
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFilename, setAudioFilename] = useState("voxpop.wav");

  // Design
  const [gender, setGender] = useState<Gender>("female");
  const [age, setAge] = useState<Age>("adult");
  const [tone, setTone] = useState<Tone>("gentle");
  const [pace, setPace] = useState<Pace>("normal");
  const [manualPrefixEnabled, setManualPrefixEnabled] = useState(false);
  const [manualPrefix, setManualPrefix] = useState("");

  // Controllable
  const [controllableAudio, setControllableAudio] = useState<File | null>(null);
  const [controllableStyle, setControllableStyle] = useState("");
  const controllableAudioRef = useRef<HTMLInputElement | null>(null);

  // Ultimate
  const [ultimateAudio, setUltimateAudio] = useState<File | null>(null);
  const [ultimateTranscript, setUltimateTranscript] = useState("");
  const ultimateAudioRef = useRef<HTMLInputElement | null>(null);

  // Voices + history (localStorage / session)
  const [voices, setVoices] = useState<VoicePreset[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeVoiceId, setActiveVoiceId] = useState<string | null>(null);

  // ------------------ Voice presets persistence ----------------------------

  useEffect(() => {
    try {
      const rawV = localStorage.getItem(STORAGE_KEY_VOICES);
      if (rawV) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVoices(JSON.parse(rawV) as VoicePreset[]);
      }
      const rawH = localStorage.getItem(STORAGE_KEY_HISTORY);
      if (rawH) {
        setHistory(JSON.parse(rawH) as HistoryItem[]);
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_VOICES, JSON.stringify(voices));
    } catch {
      // quota / availability — non-fatal
    }
  }, [voices]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
    } catch {
      // quota / availability — non-fatal
    }
  }, [history]);

  // ------------------ Handlers --------------------------------------------

  const saveCurrentVoice = useCallback(() => {
    const name = prompt("Name this voice", `${capitalize(tone)} ${gender}`);
    if (!name?.trim()) return;
    const v: VoicePreset = {
      id: newId(),
      name: name.trim(),
      gender,
      age,
      tone,
      pace,
      createdAt: Date.now(),
    };
    setVoices((prev) => [v, ...prev]);
    setActiveVoiceId(v.id);
    toast.success(`Saved “${v.name}”`);
  }, [gender, age, tone, pace]);

  const loadVoice = useCallback((v: VoicePreset) => {
    setGender(v.gender);
    setAge(v.age);
    setTone(v.tone);
    setPace(v.pace);
    setManualPrefixEnabled(false);
    setActiveVoiceId(v.id);
    setTab("design");
  }, []);

  const deleteVoice = useCallback(
    (id: string) => {
      setVoices((prev) => prev.filter((v) => v.id !== id));
      if (activeVoiceId === id) setActiveVoiceId(null);
    },
    [activeVoiceId],
  );

  // ------------------ Warmup ----------------------------------------------

  const scheduleIdleReset = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    // Match Modal's scaledown_window (300s); flip to idle once container has likely scaled down.
    idleTimerRef.current = setTimeout(() => {
      setWarmupState("idle");
    }, 5 * 60 * 1000);
  }, []);

  const warmup = useCallback(async () => {
    const modalUrl = process.env.NEXT_PUBLIC_MODAL_URL;
    if (!modalUrl) {
      setWarmupState("error");
      toast.error("NEXT_PUBLIC_MODAL_URL not configured — set it in .env.local");
      return;
    }
    setWarmupState("warming");
    try {
      const res = await fetch(`${modalUrl}/health`, { method: "GET" });
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      setWarmupState("ready");
      scheduleIdleReset();
      setTimeout(() => setWarmupOpen(false), 700);
    } catch (err) {
      setWarmupState("error");
      const message =
        err instanceof Error ? err.message : "Warmup failed — see console";
      toast.error(message);
    }
  }, [scheduleIdleReset]);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const buildDesignText = () => {
    let prefix: string;
    if (manualPrefixEnabled) {
      prefix = manualPrefix.trim();
    } else {
      // VoxCPM2 responds to natural-language descriptors like "woman" / "man",
      // not biological labels like "female" / "male".
      const genderNoun = gender === "female" ? "woman" : "man";
      const article =
        age === "adult" || age === "elderly" ? "An" : "A";
      prefix = `(${article} ${age} ${genderNoun}, ${tone} tone, ${pace} pace)`;
    }
    const body = text.trim();
    return prefix ? `${prefix} ${body}` : body;
  };

  const buildControllableText = () => {
    const style = controllableStyle.trim();
    const body = text.trim();
    return style ? `(${style}) ${body}` : body;
  };

  const handleGenerate = async () => {
    const modalUrl = process.env.NEXT_PUBLIC_MODAL_URL;
    if (!modalUrl) {
      toast.error("NEXT_PUBLIC_MODAL_URL not configured — set it in .env.local");
      return;
    }
    if (!text.trim()) {
      toast.error("Enter some text to synthesize.");
      return;
    }

    const formData = new FormData();
    formData.append("cfg_value", String(cfgValue));

    let endpoint = "";
    let displayText = "";
    if (tab === "design") {
      endpoint = "/design";
      const built = buildDesignText();
      formData.append("text", built);
      displayText = built;
    } else if (tab === "controllable") {
      if (!controllableAudio) {
        toast.error("Choose a reference audio file.");
        return;
      }
      endpoint = "/clone-controllable";
      const built = buildControllableText();
      formData.append("text", built);
      formData.append("reference_audio", controllableAudio);
      displayText = built;
    } else {
      if (!ultimateAudio) {
        toast.error("Choose a reference audio file.");
        return;
      }
      if (!ultimateTranscript.trim()) {
        toast.error("Enter the reference audio transcript.");
        return;
      }
      endpoint = "/clone-ultimate";
      formData.append("text", text.trim());
      formData.append("prompt_audio", ultimateAudio);
      formData.append("prompt_text", ultimateTranscript.trim());
      displayText = text.trim();
    }

    setLoading(true);
    // Don't revoke audioUrl here — it's still referenced by history entries.
    // Blob URLs are released when the page unloads.
    setAudioUrl(null);

    try {
      const res = await fetch(`${modalUrl}${endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let message = `Request failed: ${res.status} ${res.statusText}`;
        try {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const data: unknown = await res.json();
            if (
              typeof data === "object" &&
              data !== null &&
              "detail" in data &&
              typeof (data as { detail: unknown }).detail === "string"
            ) {
              message = (data as { detail: string }).detail;
            } else if (
              typeof data === "object" &&
              data !== null &&
              "error" in data &&
              typeof (data as { error: unknown }).error === "string"
            ) {
              message = (data as { error: string }).error;
            } else {
              message = JSON.stringify(data);
            }
          } else {
            const errText = await res.text();
            if (errText) message = errText;
          }
        } catch {
          // keep fallback
        }
        toast.error(message);
        return;
      }

      const blob = await res.blob();
      const ts = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19);
      const filename = `voxpop-${ts}.wav`;

      // Upload to Vercel Blob so the URL survives reloads.
      // Fall back to an ephemeral object URL if the upload fails.
      let permanentUrl = "";
      try {
        const upRes = await fetch(
          `/api/upload?filename=${encodeURIComponent(filename)}`,
          { method: "POST", body: blob },
        );
        if (upRes.ok) {
          const data = (await upRes.json()) as { url?: string };
          if (data.url) permanentUrl = data.url;
        }
      } catch {
        // network / route failure — fall through to ephemeral URL
      }

      const url = permanentUrl || URL.createObjectURL(blob);

      setAudioUrl(url);
      setAudioFilename(filename);
      setWarmupState("ready");
      scheduleIdleReset();

      setHistory((prev) => {
        const item: HistoryItem = {
          id: newId(),
          mode: tab,
          text: displayText,
          audioUrl: url,
          filename,
          timestamp: Date.now(),
        };
        return [item, ...prev].slice(0, HISTORY_LIMIT);
      });

      toast.success("Audio generated.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown network error.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = (item: HistoryItem) => {
    setAudioUrl(item.audioUrl);
    setAudioFilename(item.filename);
  };

  // ------------------ Derived ----------------------------------------------

  const generateDisabled = useMemo(() => {
    if (loading) return true;
    if (!text.trim()) return true;
    if (tab === "controllable" && !controllableAudio) return true;
    if (tab === "ultimate" && (!ultimateAudio || !ultimateTranscript.trim()))
      return true;
    return false;
  }, [
    loading,
    text,
    tab,
    controllableAudio,
    ultimateAudio,
    ultimateTranscript,
  ]);

  // ------------------ Render -----------------------------------------------

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* Warmup dialog */}
      <Dialog open={warmupOpen} onOpenChange={setWarmupOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Warm up the GPU</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              The Modal container scales to zero when idle. A cold start takes
              ~60s while VoxCPM2 loads. Warm it now or skip and the first
              Generate will warm it for you.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-4 pt-2">
            <Button
              onClick={warmup}
              disabled={warmupState === "warming"}
              className="h-11 px-6 font-mono text-sm uppercase tracking-[0.15em]"
            >
              {warmupState === "warming" && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {warmupState === "ready" ? "Warm" : "Warm up"}
            </Button>
            <StatusBadge state={warmupState} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Top bar */}
      <header className="h-16 shrink-0 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <CircleDot className="size-5 text-primary" />
          <span className="text-xl font-semibold tracking-tight">
            vox<span className="text-muted-foreground">·</span>populi
          </span>
        </div>
        <button
          onClick={() => setWarmupOpen(true)}
          className="flex items-center gap-3 px-3 py-1.5 rounded-md hover:bg-muted/60 transition-colors"
          aria-label="GPU status"
        >
          <StatusBadge state={warmupState} />
        </button>
      </header>

      {/* Main */}
      <div className="flex-1 min-h-0 flex">
        {/* Sidebar */}
        <aside className="hidden md:flex w-80 shrink-0 border-r border-border bg-muted/30 flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Voices */}
            <section className="p-5">
              <header className="flex items-center justify-between mb-3 px-1">
                <span className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground">
                  Voices
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={saveCurrentVoice}
                  aria-label="Save current voice"
                >
                  <Plus className="size-4" />
                </Button>
              </header>
              {voices.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1 leading-relaxed">
                  No saved voices yet. Configure a Design voice and hit
                  <Save className="inline-block size-4 mx-1 align-text-bottom" />
                  to save.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {voices.map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => loadVoice(v)}
                        className={`group w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center gap-3 transition-colors ${
                          activeVoiceId === v.id
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/40"
                        }`}
                      >
                        <span
                          className={`size-2 rounded-full ${
                            activeVoiceId === v.id
                              ? "bg-primary"
                              : "bg-muted-foreground/40"
                          }`}
                        />
                        <span className="flex-1 truncate">{v.name}</span>
                        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                          {v.gender[0]}·{v.age[0]}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteVoice(v.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Delete"
                        >
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="h-px bg-border mx-5" />

            {/* History */}
            <section className="p-5">
              <header className="flex items-center gap-2 mb-3 px-1">
                <History className="size-4 text-muted-foreground" />
                <span className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground">
                  History
                </span>
              </header>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">
                  Nothing yet this session.
                </p>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {history.map((h) => {
                    const active = audioUrl === h.audioUrl;
                    return (
                      <li key={h.id}>
                        <button
                          onClick={() => loadHistory(h)}
                          className={`relative w-full text-left pl-4 pr-3 py-3 rounded-md text-sm transition-colors ${
                            active
                              ? "bg-background border border-border shadow-sm"
                              : "border border-transparent hover:bg-accent/60"
                          }`}
                        >
                          {active && (
                            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-primary" />
                          )}
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-mono uppercase tracking-wider ${
                                active ? "text-primary" : "text-muted-foreground"
                              }`}
                            >
                              {h.mode}
                            </span>
                            <span className="text-xs font-mono text-muted-foreground ml-auto">
                              {formatRelative(h.timestamp)}
                            </span>
                          </div>
                          <div className="truncate text-foreground/90">
                            {h.text || "(empty)"}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </aside>

        {/* Main canvas */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-10 py-10 flex flex-col gap-8">
            {/* Mode tabs */}
            <div className="flex items-center gap-1 p-1.5 bg-muted/40 rounded-lg border border-border self-start">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`group relative px-5 py-2.5 rounded-md text-sm font-mono uppercase tracking-[0.15em] transition-colors ${
                    tab === t.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-4 mr-2 text-sm font-mono text-muted-foreground hidden lg:inline">
                {TABS.find((t) => t.key === tab)?.sub}
              </span>
            </div>

            {/* Mode-specific controls */}
            {tab === "design" && (
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground">
                    Voice
                  </span>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={manualPrefixEnabled}
                      onChange={(e) =>
                        setManualPrefixEnabled(e.target.checked)
                      }
                      className="size-3 rounded border-input accent-primary"
                    />
                    Manual prefix
                  </label>
                </div>

                {manualPrefixEnabled ? (
                  <Input
                    placeholder="(A young woman, cheerful tone, normal pace)"
                    value={manualPrefix}
                    onChange={(e) => setManualPrefix(e.target.value)}
                    className="font-mono text-xs"
                  />
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <VoiceSelect
                      label="Gender"
                      value={gender}
                      options={GENDERS}
                      onChange={(v) => setGender(v as Gender)}
                    />
                    <VoiceSelect
                      label="Age"
                      value={age}
                      options={AGES}
                      onChange={(v) => setAge(v as Age)}
                    />
                    <VoiceSelect
                      label="Tone"
                      value={tone}
                      options={TONES}
                      onChange={(v) => setTone(v as Tone)}
                    />
                    <VoiceSelect
                      label="Pace"
                      value={pace}
                      options={PACES}
                      onChange={(v) => setPace(v as Pace)}
                    />
                  </div>
                )}
              </section>
            )}

            {tab === "controllable" && (
              <section className="flex flex-col gap-4">
                <span className="text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground">
                  Reference + style
                </span>
                <div className="grid grid-cols-2 gap-4 items-stretch">
                  <FileSlot
                    label="Reference audio"
                    file={controllableAudio}
                    inputRef={controllableAudioRef}
                    onChange={(e) =>
                      setControllableAudio(e.target.files?.[0] ?? null)
                    }
                  />
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="ctrl-style"
                      className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground"
                    >
                      Style (optional)
                    </Label>
                    <Input
                      id="ctrl-style"
                      placeholder="slightly faster, cheerful tone"
                      value={controllableStyle}
                      onChange={(e) => setControllableStyle(e.target.value)}
                      className="h-full font-mono text-sm"
                    />
                  </div>
                </div>
              </section>
            )}

            {tab === "ultimate" && (
              <section className="flex flex-col gap-4">
                <span className="text-xs font-mono uppercase tracking-[0.15em] text-muted-foreground">
                  Reference + transcript
                </span>
                <div className="grid grid-cols-2 gap-4 items-start">
                  <FileSlot
                    label="Reference audio"
                    file={ultimateAudio}
                    inputRef={ultimateAudioRef}
                    onChange={(e) =>
                      setUltimateAudio(e.target.files?.[0] ?? null)
                    }
                  />
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="ult-transcript"
                      className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground"
                    >
                      Transcript of reference
                    </Label>
                    <Textarea
                      id="ult-transcript"
                      placeholder="Exact transcript of the reference audio"
                      value={ultimateTranscript}
                      onChange={(e) => setUltimateTranscript(e.target.value)}
                      className="min-h-[96px] resize-none font-mono text-sm"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Text input */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="main-text"
                  className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground"
                >
                  Text to speak
                </Label>
                <span className="text-sm font-mono text-muted-foreground tabular-nums">
                  {text.length}
                </span>
              </div>
              <Textarea
                id="main-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste what you want the voice to say…"
                className="min-h-[220px] resize-none text-base leading-relaxed"
                autoFocus
              />
            </div>

            {/* CFG + Generate */}
            <div className="flex items-end gap-6 pt-2">
              <div className="flex-1">
                <SliderField
                  label="CFG"
                  value={cfgValue}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={setCfgValue}
                  display={cfgValue.toFixed(1)}
                />
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generateDisabled}
                size="lg"
                className="h-14 px-10 font-mono text-sm uppercase tracking-[0.18em] shrink-0"
              >
                {loading ? (
                  <>
                    <span className="size-2 rounded-full bg-primary-foreground animate-pulse" />
                    Generating
                  </>
                ) : (
                  <>
                    <span className="size-2 rounded-full bg-primary-foreground" />
                    Generate
                  </>
                )}
              </Button>
            </div>
            {loading && (
              <span className="text-sm font-mono text-muted-foreground">
                first request after idle can take ~60s (cold start)
              </span>
            )}
          </div>
        </main>
      </div>

      {/* Bottom player */}
      <PlayerBar audioUrl={audioUrl} filename={audioFilename} />
    </div>
  );
}

// --------------------------------------------------------------------------
// Subcomponents
// --------------------------------------------------------------------------

function StatusBadge({ state }: { state: WarmupState }) {
  const config = {
    idle: { dot: "bg-red-500", label: "cold" },
    warming: { dot: "bg-amber-500 animate-pulse", label: "warming" },
    ready: { dot: "bg-emerald-500", label: "ready" },
    error: { dot: "bg-red-500", label: "error" },
  }[state];
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2.5 rounded-full ${config.dot}`} />
      <span className="text-sm uppercase tracking-[0.15em] text-muted-foreground">
        {config.label}
      </span>
    </div>
  );
}

function VoiceSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full h-11 font-mono text-sm uppercase tracking-wide">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((v) => (
            <SelectItem
              key={v}
              value={v}
              className="font-mono text-sm uppercase tracking-wide"
            >
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </Label>
        <span className="text-base font-mono tabular-nums text-foreground">
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

function FileSlot({
  label,
  file,
  inputRef,
  onChange,
}: {
  label: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-mono uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </Label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-3 px-4 py-4 rounded-md border border-dashed border-border bg-muted/30 hover:bg-muted/60 transition-colors text-left"
      >
        <Upload className="size-5 shrink-0 text-muted-foreground" />
        <span className="flex-1 min-w-0 truncate text-sm font-mono">
          {file ? file.name : "click to choose .wav / .mp3"}
        </span>
        {file && (
          <span className="text-sm font-mono text-muted-foreground tabular-nums">
            {(file.size / 1024).toFixed(0)} kb
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}
