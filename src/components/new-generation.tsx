"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Magicpen } from "iconsax-react";
import { api } from "./client-api";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SelectLabel } from "./select-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const durations: [number, string][] = [
  [30, "30 seconds"],
  [60, "60 seconds"],
  [90, "90 seconds"],
  [180, "3 minutes"],
  [300, "5 minutes"],
];
const aspectLabels: Record<string, string> = {
  "9:16": "9:16 · Vertical",
  "16:9": "16:9 · Landscape",
  "1:1": "1:1 · Square",
};
const formats = [
  "Cinematic Explainer",
  "24 Hours Without...",
  "POV: You Are...",
  "Mystery Explained",
  "What If...",
  "Future Historian",
  "Myth Investigation",
  "Mini Documentary",
  "Custom",
];
const styles = [
  "Cinematic Realistic",
  "3D Animated",
  "Stylized Animation",
  "Documentary",
  "Sci-Fi",
  "Dark Cinematic",
  "Bright Educational",
  "Custom",
];
// No shadcn textarea ships in ui/, so multiline fields are a native textarea styled like ui/input.
const textareaClass =
  "min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";
export function NewGeneration() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  // Radix Select is not a form control, so the chosen values are mirrored into hidden
  // inputs that keep the existing FormData payload identical.
  const [fields, setFields] = useState({
    targetDuration: "60",
    platform: "TikTok",
    aspectRatio: "9:16",
    contentFormat: formats[0],
    visualStyle: styles[0],
  });
  const setField = (key: keyof typeof fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Start with an idea</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We’ll turn your topic into a script and a shot-by-shot storyboard.
        </p>
      </header>
      <Card>
        <CardContent>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                const g = await api<{ id: string }>("generations", {
                  ...data,
                  targetDuration: Number(data.targetDuration),
                });
                router.push(`/generations/${g.id}`);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="topic" className="text-xs font-semibold">
                What’s your video about?
              </Label>
              <textarea
                id="topic"
                name="topic"
                required
                minLength={8}
                maxLength={2000}
                placeholder="What would happen if the Internet disappeared for 24 hours?"
                className={textareaClass}
              />
              <p className="text-xs text-muted-foreground">
                A question, an unexpected fact, or a world you want to explore.
              </p>
            </div>
            <div className="mt-5 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="targetDuration" className="text-xs font-semibold">
                  Target duration
                </Label>
                <Select
                  value={fields.targetDuration}
                  onValueChange={setField("targetDuration")}
                >
                  <SelectTrigger id="targetDuration" className="w-full">
                    <SelectLabel>
                      {durations.find(
                        ([v]) => String(v) === fields.targetDuration,
                      )?.[1] ?? ""}
                    </SelectLabel>
                  </SelectTrigger>
                  <SelectContent>
                    {durations.map(([value, label]) => (
                      <SelectItem key={String(value)} value={String(value)}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name="targetDuration"
                  value={fields.targetDuration}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language" className="text-xs font-semibold">
                  Language
                </Label>
                <Input
                  id="language"
                  name="language"
                  defaultValue="English"
                  required
                  maxLength={60}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="platform" className="text-xs font-semibold">
                  Platform
                </Label>
                <Select value={fields.platform} onValueChange={setField("platform")}>
                  <SelectTrigger id="platform" className="w-full">
                    <SelectLabel>{fields.platform}</SelectLabel>
                  </SelectTrigger>
                  <SelectContent>
                    {["TikTok", "YouTube Shorts", "Instagram Reels", "YouTube"].map(
                      (v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
                <input type="hidden" name="platform" value={fields.platform} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aspectRatio" className="text-xs font-semibold">
                  Aspect ratio
                </Label>
                <Select
                  value={fields.aspectRatio}
                  onValueChange={setField("aspectRatio")}
                >
                  <SelectTrigger id="aspectRatio" className="w-full">
                    <SelectLabel>
                      {aspectLabels[fields.aspectRatio] ?? fields.aspectRatio}
                    </SelectLabel>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 · Vertical</SelectItem>
                    <SelectItem value="16:9">16:9 · Landscape</SelectItem>
                    <SelectItem value="1:1">1:1 · Square</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="aspectRatio" value={fields.aspectRatio} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contentFormat" className="text-xs font-semibold">
                  Content format
                </Label>
                <Select
                  value={fields.contentFormat}
                  onValueChange={setField("contentFormat")}
                >
                  <SelectTrigger id="contentFormat" className="w-full">
                    <SelectLabel>{fields.contentFormat}</SelectLabel>
                  </SelectTrigger>
                  <SelectContent>
                    {formats.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  type="hidden"
                  name="contentFormat"
                  value={fields.contentFormat}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="visualStyle" className="text-xs font-semibold">
                  Visual style
                </Label>
                <Select
                  value={fields.visualStyle}
                  onValueChange={setField("visualStyle")}
                >
                  <SelectTrigger id="visualStyle" className="w-full">
                    <SelectLabel>{fields.visualStyle}</SelectLabel>
                  </SelectTrigger>
                  <SelectContent>
                    {styles.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" name="visualStyle" value={fields.visualStyle} />
              </div>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer py-3.5 text-xs text-muted-foreground">
                Advanced · Custom instructions
              </summary>
              <textarea
                id="customInstructions"
                name="customInstructions"
                maxLength={4000}
                placeholder="Audience, tone, visual direction, facts to include or avoid…"
                className={textareaClass}
              />
            </details>
            <div className="my-4 flex items-start gap-2 rounded-lg border border-border bg-secondary px-4 py-3 text-xs text-secondary-foreground">
              <Magicpen size={16} className="mt-px shrink-0" />
              <span>
                You’ll review your script and storyboard before any video clips are
                generated.
              </span>
            </div>
            {error && (
              <div
                className="my-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t pt-5">
              <small className="text-xs text-muted-foreground">
                Planning first. You stay in control.
              </small>
              <Button disabled={busy}>
                {busy ? "Creating…" : "Create storyboard"}
                <ArrowRight size={16} />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
