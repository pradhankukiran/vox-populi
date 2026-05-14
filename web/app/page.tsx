"use client";

import { useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Loader2, ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Gender = "male" | "female";
type Age = "young" | "adult" | "elderly";
type Tone = "gentle" | "cheerful" | "serious" | "melancholy" | "angry";
type Pace = "slow" | "normal" | "fast";
type TabKey = "design" | "controllable" | "ultimate";

const GENDERS: Gender[] = ["male", "female"];
const AGES: Age[] = ["young", "adult", "elderly"];
const TONES: Tone[] = ["gentle", "cheerful", "serious", "melancholy", "angry"];
const PACES: Pace[] = ["slow", "normal", "fast"];

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function Home() {
  // Shared state
  const [tab, setTab] = useState<TabKey>("design");
  const [text, setText] = useState<string>("");
  const [cfgValue, setCfgValue] = useState<number>(2.0);
  const [inferenceTimesteps, setInferenceTimesteps] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioFilename, setAudioFilename] = useState<string>("voxpop.wav");
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  // Tab 1: Voice Design
  const [gender, setGender] = useState<Gender>("female");
  const [age, setAge] = useState<Age>("adult");
  const [tone, setTone] = useState<Tone>("gentle");
  const [pace, setPace] = useState<Pace>("normal");
  const [manualPrefixEnabled, setManualPrefixEnabled] =
    useState<boolean>(false);
  const [manualPrefix, setManualPrefix] = useState<string>("");

  // Tab 2: Controllable Cloning
  const [controllableAudio, setControllableAudio] = useState<File | null>(null);
  const [controllableStyle, setControllableStyle] = useState<string>("");

  // Tab 3: Ultimate Cloning
  const [ultimateAudio, setUltimateAudio] = useState<File | null>(null);
  const [ultimateTranscript, setUltimateTranscript] = useState<string>("");

  const handleControllableAudio = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setControllableAudio(file);
  };

  const handleUltimateAudio = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUltimateAudio(file);
  };

  const buildDesignText = (): string => {
    const prefix = manualPrefixEnabled
      ? manualPrefix.trim()
      : `(a ${age} ${gender}, ${tone} tone, ${pace} pace)`;
    const body = text.trim();
    if (!prefix) {
      return body;
    }
    return `${prefix} ${body}`;
  };

  const buildControllableText = (): string => {
    const style = controllableStyle.trim();
    const body = text.trim();
    if (!style) {
      return body;
    }
    return `(${style}) ${body}`;
  };

  const handleGenerate = async () => {
    const modalUrl = process.env.NEXT_PUBLIC_MODAL_URL;
    if (!modalUrl) {
      toast.error(
        "NEXT_PUBLIC_MODAL_URL not configured — set it in .env.local",
      );
      return;
    }

    if (!text.trim()) {
      toast.error("Please enter some text to synthesize.");
      return;
    }

    const formData = new FormData();
    formData.append("cfg_value", String(cfgValue));
    formData.append("inference_timesteps", String(inferenceTimesteps));

    let endpoint = "";
    if (tab === "design") {
      endpoint = "/design";
      formData.append("text", buildDesignText());
    } else if (tab === "controllable") {
      if (!controllableAudio) {
        toast.error("Please choose a reference audio file.");
        return;
      }
      endpoint = "/clone-controllable";
      formData.append("text", buildControllableText());
      formData.append("reference_audio", controllableAudio);
    } else {
      if (!ultimateAudio) {
        toast.error("Please choose a reference audio file.");
        return;
      }
      if (!ultimateTranscript.trim()) {
        toast.error("Please enter the reference audio transcript.");
        return;
      }
      endpoint = "/clone-ultimate";
      formData.append("text", text.trim());
      formData.append("prompt_audio", ultimateAudio);
      formData.append("prompt_text", ultimateTranscript.trim());
    }

    setLoading(true);
    // Revoke any prior blob URL before we overwrite it.
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);

    try {
      const res = await fetch(`${modalUrl}${endpoint}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let message = `Request failed: ${res.status} ${res.statusText}`;
        try {
          const contentType = res.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
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
            if (errText) {
              message = errText;
            }
          }
        } catch {
          // Ignore parse errors; keep status text fallback.
        }
        toast.error(message);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "_")
        .slice(0, 19);
      setAudioUrl(url);
      setAudioFilename(`voxpop-${timestamp}.wav`);
      toast.success("Audio generated.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown network error.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex justify-center px-4 py-10">
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">vox-populi</h1>
          <p className="text-sm text-muted-foreground">
            Text-to-Speech powered by VoxCPM2
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Synthesize</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as TabKey)}
              className="w-full"
            >
              <TabsList className="w-full">
                <TabsTrigger value="design">Voice Design</TabsTrigger>
                <TabsTrigger value="controllable">
                  Controllable Cloning
                </TabsTrigger>
                <TabsTrigger value="ultimate">Ultimate Cloning</TabsTrigger>
              </TabsList>

              <TabsContent value="design" className="flex flex-col gap-4 pt-4">
                <div className="flex items-center gap-2">
                  <input
                    id="manual-prefix-toggle"
                    type="checkbox"
                    checked={manualPrefixEnabled}
                    onChange={(event) =>
                      setManualPrefixEnabled(event.target.checked)
                    }
                    className="size-4 rounded border-input accent-primary"
                  />
                  <Label
                    htmlFor="manual-prefix-toggle"
                    className="cursor-pointer"
                  >
                    Manual prefix
                  </Label>
                </div>

                {manualPrefixEnabled ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="manual-prefix-input">
                      Custom prefix (include parens)
                    </Label>
                    <Input
                      id="manual-prefix-input"
                      placeholder="(a young female, cheerful tone, normal pace)"
                      value={manualPrefix}
                      onChange={(event) =>
                        setManualPrefix(event.target.value)
                      }
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Gender</Label>
                      <Select
                        value={gender}
                        onValueChange={(value) => setGender(value as Gender)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Gender" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDERS.map((value) => (
                            <SelectItem key={value} value={value}>
                              {capitalize(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Age</Label>
                      <Select
                        value={age}
                        onValueChange={(value) => setAge(value as Age)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Age" />
                        </SelectTrigger>
                        <SelectContent>
                          {AGES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {capitalize(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Tone</Label>
                      <Select
                        value={tone}
                        onValueChange={(value) => setTone(value as Tone)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Tone" />
                        </SelectTrigger>
                        <SelectContent>
                          {TONES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {capitalize(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Pace</Label>
                      <Select
                        value={pace}
                        onValueChange={(value) => setPace(value as Pace)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Pace" />
                        </SelectTrigger>
                        <SelectContent>
                          {PACES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {capitalize(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <Label htmlFor="design-text">Text</Label>
                  <Textarea
                    id="design-text"
                    rows={6}
                    placeholder="Enter the text to synthesize…"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value="controllable"
                className="flex flex-col gap-4 pt-4"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="controllable-audio">Reference audio</Label>
                  <Input
                    id="controllable-audio"
                    type="file"
                    accept="audio/wav,audio/mpeg,audio/*"
                    onChange={handleControllableAudio}
                  />
                  {controllableAudio && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {controllableAudio.name}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="controllable-style">
                    Style instruction (optional)
                  </Label>
                  <Input
                    id="controllable-style"
                    placeholder="e.g. cheerful, soft, fast"
                    value={controllableStyle}
                    onChange={(event) =>
                      setControllableStyle(event.target.value)
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Wrapped automatically as <code>(style)</code> prefix on send.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="controllable-text">Text</Label>
                  <Textarea
                    id="controllable-text"
                    rows={6}
                    placeholder="Enter the text to synthesize…"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </div>
              </TabsContent>

              <TabsContent
                value="ultimate"
                className="flex flex-col gap-4 pt-4"
              >
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ultimate-audio">Reference audio</Label>
                  <Input
                    id="ultimate-audio"
                    type="file"
                    accept="audio/wav,audio/mpeg,audio/*"
                    onChange={handleUltimateAudio}
                  />
                  {ultimateAudio && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {ultimateAudio.name}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="ultimate-transcript">
                    Reference audio transcript
                  </Label>
                  <Textarea
                    id="ultimate-transcript"
                    rows={3}
                    placeholder="The exact transcription of the reference audio…"
                    value={ultimateTranscript}
                    onChange={(event) =>
                      setUltimateTranscript(event.target.value)
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="ultimate-text">Text</Label>
                  <Textarea
                    id="ultimate-text"
                    rows={6}
                    placeholder="Enter the new text to synthesize…"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <Collapsible
              open={advancedOpen}
              onOpenChange={setAdvancedOpen}
              className="border rounded-lg"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-accent/40 transition-colors rounded-lg"
                >
                  <span>Advanced</span>
                  <ChevronDown
                    className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="px-4 pb-4 pt-2 flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <Label htmlFor="cfg-slider">cfg_value</Label>
                    <span className="text-muted-foreground tabular-nums">
                      {cfgValue.toFixed(1)}
                    </span>
                  </div>
                  <Slider
                    id="cfg-slider"
                    min={0}
                    max={5}
                    step={0.1}
                    value={[cfgValue]}
                    onValueChange={(values) => setCfgValue(values[0] ?? 0)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <Label htmlFor="timesteps-slider">
                      inference_timesteps
                    </Label>
                    <span className="text-muted-foreground tabular-nums">
                      {inferenceTimesteps}
                    </span>
                  </div>
                  <Slider
                    id="timesteps-slider"
                    min={1}
                    max={50}
                    step={1}
                    value={[inferenceTimesteps]}
                    onValueChange={(values) =>
                      setInferenceTimesteps(values[0] ?? 1)
                    }
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  "Generate"
                )}
              </Button>
              {loading && (
                <p className="text-xs text-muted-foreground">
                  First request after idle can take up to ~60s (Modal cold
                  start)
                </p>
              )}
            </div>

            {audioUrl && (
              <div className="flex flex-col gap-3 border rounded-lg p-4">
                <audio controls src={audioUrl} className="w-full">
                  Your browser does not support the audio element.
                </audio>
                <div>
                  <Button asChild variant="secondary" size="sm">
                    <a href={audioUrl} download={audioFilename}>
                      <Download className="size-4" />
                      Download
                    </a>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
