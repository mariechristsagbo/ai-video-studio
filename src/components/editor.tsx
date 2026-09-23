"use client";
import { useEffect, useState, useCallback, Fragment } from "react";
import {
  VideoPlay,
  Magicpen,
  ExportSquare,
  Refresh,
  ArrowUp2,
  ArrowDown2,
  Copy,
  Trash,
  TickCircle,
} from "iconsax-react";
import { LoaderCircle } from "lucide-react";
import { api } from "./client-api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";
import { SelectLabel } from "./select-label";
import { Skeleton } from "./ui/skeleton";
import { progress } from "@/domain/video";
import type { detail, Shot } from "@/generations/repository";
type Detail = Awaited<ReturnType<typeof detail>>;
type Action = (path: string, body: unknown) => Promise<void>;
const NONE = "none";
const labelClass = "mb-2 block text-sm font-medium text-foreground";
const errorClass =
  "my-3 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive";
const noticeClass =
  "my-3.5 rounded-md border border-border bg-secondary px-4 py-3 text-xs text-muted-foreground";
const textareaClass =
  "w-full resize-y rounded-md border border-input bg-background px-3 py-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
type Option = { value: string; label: string };
const MODE_OPTIONS: Option[] = [
  { value: "text", label: "Text" },
  { value: "keyframe", label: "Keyframe" },
  { value: "reference", label: "Reference" },
];
/** The pipeline as the user sees it, mapped onto the studio's status model. */
const PIPELINE = ["Brief & storyboard", "Shot videos", "Montage", "Ready"];
function pipelineStage(status: string, clips: number) {
  if (status === "COMPLETED") return 3;
  if (["READY_TO_RENDER", "RENDERING"].includes(status)) return 2;
  if (["STORYBOARD_READY", "QUEUED", "GENERATING"].includes(status)) return 1;
  if (status === "FAILED" || status === "UNCERTAIN") return clips > 0 ? 1 : 0;
  return 0;
}
const TRANSITION_OPTIONS: Option[] = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
  { value: "crossfade", label: "Crossfade" },
];
// Radix renders an item's label only once its content has been mounted, so these stay controlled and
// the key resets the selection whenever another shot is opened.
function InspectorSelect({
  name,
  initial,
  options,
}: {
  name: string;
  initial: string;
  options: Option[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <Select name={name} value={value} onValueChange={setValue}>
      <SelectTrigger className="w-full">
        <SelectLabel>{options.find((o) => o.value === value)?.label ?? ""}</SelectLabel>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function StatusPill({
  status,
  className = "",
}: {
  status: string;
  className?: string;
}) {
  const failed = ["FAILED", "UNCERTAIN"].includes(status);
  return (
    <Badge
      variant={failed ? "outline" : status === "COMPLETED" ? "default" : "secondary"}
      className={`capitalize ${failed ? "border-destructive/20 bg-destructive/10 text-destructive" : ""} ${className}`}
    >
      {status.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
export function Editor({ id }: { id: string }) {
  const [data, setData] = useState<Detail>(),
    [selected, setSelected] = useState<string>(),
    [tab, setTab] = useState("storyboard"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [final, setFinal] = useState(false),
    [showPrompt, setShowPrompt] = useState(false);
  const load = useCallback(async () => {
    const d = await api<Detail>(`generations/${id}`);
    setData(d);
    setSelected((s) => (d.shots.some((shot) => shot.id === s) ? s : d.shots[0]?.id));
  }, [id]);
  useEffect(() => {
    let active = true;
    const tick = () => {
      if (active) void load().catch((e) => setError(e.message));
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);
  const act: Action = async (path, body) => {
    setBusy(true);
    setError("");
    try {
      await api(`generations/${id}/${path}`, body);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <>
        {error && <div className={errorClass}>{error}</div>}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-64" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="my-2.5 h-1.5 w-full rounded-full" />
        <div className="mb-5 mt-6 flex gap-6 border-b border-border pb-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-2 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="ml-auto h-3 w-8" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {["w-32", "w-24", "w-20", "w-16"].map((width) => (
              <div className="flex items-center gap-1.5" key={width}>
                <Skeleton className="size-2 shrink-0 rounded-full" />
                <Skeleton className={`h-3 ${width}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div className="flex flex-col gap-4">
            <Skeleton className="min-h-[310px] w-full rounded-lg" />
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-8 w-32" />
            </div>
            <div className="flex gap-3 overflow-hidden pb-4 pt-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[136px] shrink-0 overflow-hidden rounded-lg border border-border"
                >
                  <Skeleton className="h-[78px] w-full rounded-none" />
                  <div className="flex flex-col gap-2 p-2.5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-[100px] w-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-[150px] w-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      </>
    );
  const { generation: g, shots, scenes, renders } = data,
    shot = shots.find((s) => s.id === selected),
    completed = shots.filter((s) => s.clipId).length,
    failed = shots.filter((s) => ["FAILED", "UNCERTAIN"].includes(s.status)).length,
    queued = shots.filter((s) => s.status === "QUEUED").length,
    generating = shots.filter((s) =>
      ["SUBMITTING", "SUBMITTED", "GENERATING"].includes(s.status),
    ).length;
  const latest =
      renders.find((r) => r.id === g.finalRenderId && r.status === "COMPLETED") ||
      renders.find((r) => r.status === "COMPLETED"),
    preview = (final ? latest?.assetId : shot?.clipId) || latest?.assetId;
  const locked = ["PLANNING", "RENDERING"].includes(g.status),
    edit = (body: unknown) =>
      act("edit", { revision: g.revision, ...(body as object) });
  const stage = pipelineStage(g.status, completed),
    running = ["PLANNING", "QUEUED", "GENERATING", "RENDERING"].includes(g.status),
    percent = progress(g.status, completed, shots.length),
    stageHint =
      stage === 0
        ? g.status === "PLANNING"
          ? "Writing your brief, narration and storyboard…"
          : "Nothing started yet"
        : stage === 1
          ? `${completed} of ${shots.length} shot videos ready${generating ? ` · ${generating} generating` : ""}${queued ? ` · ${queued} queued` : ""}${failed ? ` · ${failed} failed` : ""}`
          : stage === 2
            ? g.status === "RENDERING"
              ? "Assembling the shots into your film…"
              : "Every shot is ready — run the montage"
            : "Your film is ready";
  return (
    <>
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1
            className={`text-xl font-semibold tracking-tight ${showPrompt ? "" : "line-clamp-2"}`}
          >
            {g.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusPill status={g.status} />
            <small className="text-xs text-muted-foreground">
              {g.aspectRatio} · {g.platform} · {g.targetDuration}s target
            </small>
            {g.title.length > 90 && (
              <button
                className="text-xs text-primary underline-offset-4 hover:underline"
                onClick={() => setShowPrompt((v) => !v)}
                type="button"
              >
                {showPrompt ? "Show less" : "Show full prompt"}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || locked || !shots.length}
            onClick={() => void act("generate", {})}
          >
            <Magicpen size={16} />
            Generate missing shots
          </Button>
          <Button
            disabled={
              busy ||
              locked ||
              !shots.length ||
              completed !== shots.length ||
              generating > 0 ||
              queued > 0
            }
            onClick={() => {
              setFinal(true);
              void act("render", {});
            }}
          >
            <VideoPlay size={16} />
            Render video
          </Button>
          {latest?.assetId && (
            <Button asChild variant="outline">
              <a href={`/api/media/${latest.assetId}?download=1`}>
                <ExportSquare size={15} />
                Download
              </a>
            </Button>
          )}
        </div>
      </header>
      {error && (
        <div className={errorClass} role="alert">
          {error}
        </div>
      )}
      {g.error && <div className={errorClass}>{g.error}</div>}
      <Card className="mb-5 gap-0 p-4">
        <div className="flex items-center gap-2.5">
          {running ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
          ) : (
            <span
              className={`size-2 shrink-0 rounded-full ${g.status === "COMPLETED" ? "bg-primary" : "bg-muted-foreground"}`}
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {stageHint}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {percent}%
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full bg-primary transition-[width] duration-500 ${running ? "animate-pulse" : ""}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <ol className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          {PIPELINE.map((label, index) => {
            const done = index < stage || g.status === "COMPLETED",
              current = index === stage && g.status !== "COMPLETED";
            return (
              <li className="flex items-center gap-1.5 text-xs" key={label}>
                {done ? (
                  <TickCircle size={14} variant="Bold" className="text-primary" />
                ) : current ? (
                  running ? (
                    <LoaderCircle className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <span className="size-2 rounded-full bg-primary" />
                  )
                ) : (
                  <span className="size-2 rounded-full border border-muted-foreground/40" />
                )}
                <span
                  className={
                    done || current
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>
      <div className="mb-5 mt-6 flex gap-6 border-b border-border">
        {["storyboard", "script & scenes", "audio & captions"].map((t) => (
          <button
            className={`-mb-px border-b-2 pb-3 text-xs transition-colors ${
              tab === t
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            key={t}
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === "storyboard" ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <div>
            <div className="flex min-h-[310px] items-center justify-center overflow-hidden rounded-lg bg-foreground text-muted-foreground">
              {preview ? (
                <video
                  key={preview}
                  src={`/api/media/${preview}`}
                  controls
                  preload="metadata"
                  className="max-h-[450px] w-full"
                />
              ) : (
                <div className="p-10 text-center">
                  <VideoPlay size={46} className="mx-auto block" />
                  <p className="mx-auto mt-4 max-w-[330px] text-sm">
                    Your story, one shot at a time.
                    <br />
                    Review the storyboard below, then generate your clips.
                  </p>
                </div>
              )}
            </div>
            <div className="mt-3.5 flex items-center justify-between gap-3">
              <small className="text-xs text-muted-foreground">
                {final
                  ? "Final render"
                  : shot
                    ? `Shot ${shot.position + 1} preview`
                    : "No preview yet"}
              </small>
              <div className="flex items-center gap-2">
                {latest && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setFinal(!final)}>
                      {final ? "Open storyboard" : "Watch final video"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || locked || generating > 0 || queued > 0}
                      onClick={() => void act("render", { force: true })}
                    >
                      Render again
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-3 overflow-auto pb-4 pt-1.5">
              {shots.map((s) => (
                <button
                  key={s.id}
                  className={`w-[136px] shrink-0 overflow-hidden rounded-lg border border-border bg-card text-left ${
                    selected === s.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => {
                    setSelected(s.id);
                    setFinal(false);
                  }}
                >
                  <div className="flex h-[78px] items-center justify-center overflow-hidden bg-accent text-muted-foreground">
                    {s.thumbnailId ? (
                      <img
                        className="h-full w-full object-cover"
                        src={`/api/media/${s.thumbnailId}`}
                        alt={`Shot ${s.position + 1}`}
                      />
                    ) : (
                      <VideoPlay size={22} />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-xs font-semibold">
                        Shot {s.position + 1}
                      </strong>
                      <small className="text-xs text-muted-foreground">
                        {s.duration}s
                      </small>
                    </div>
                    <StatusPill status={s.status} className="mt-2 text-[9px]" />
                  </div>
                </button>
              ))}
            </div>
            {!shots.length && g.status !== "PLANNING" && (
              <div className="rounded-xl border border-dashed border-border px-6 py-[70px] text-center text-muted-foreground">
                <p className="mx-auto mb-5 max-w-[380px] text-sm">No storyboard yet.</p>
                <Button onClick={() => void act("replan", {})} disabled={busy}>
                  Retry planning
                </Button>
              </div>
            )}
            {failed > 0 && (
              <div className={`${noticeClass} flex flex-wrap items-center gap-2`}>
                Completed clips are safe.{" "}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void act("generate", {})}
                  disabled={busy}
                >
                  Retry failed shots
                </Button>
              </div>
            )}
            <div className={noticeClass}>
              Review factual claims and prompts before generating. Agnes bills each clip
              independently. A failed replacement never removes your previous clip.
            </div>
          </div>
          {shot && (
            <ShotEditor
              key={`${shot.id}-${shot.updatedAt}`}
              shot={shot}
              data={data}
              busy={busy || locked}
              save={edit}
              act={act}
            />
          )}
        </div>
      ) : tab === "script & scenes" ? (
        <div className="max-w-[720px]">
          <Card className="px-6">
            <h2 className="text-lg font-semibold">Narration script</h2>
            <p className="text-xs text-muted-foreground">
              Edit before generating clips. Rebuild the storyboard to apply narration
              timing changes.
            </p>
            <form
              key={`script-${g.revision}`}
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                void edit({ script: String(form.get("script")) });
              }}
            >
              <textarea
                name="script"
                defaultValue={g.script}
                maxLength={30000}
                className={`${textareaClass} min-h-[250px] text-sm`}
              />
              <div className="mt-5 flex items-center gap-3">
                <Button disabled={busy || locked}>Save script</Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || locked || completed > 0}
                  onClick={() => {
                    if (
                      confirm(
                        "Rebuild the storyboard from the current saved script? Existing draft shots will be replaced.",
                      )
                    )
                      void act("replan", {});
                  }}
                >
                  Rebuild storyboard
                </Button>
              </div>
            </form>
          </Card>
          <details>
            <summary className="cursor-pointer py-3.5 text-xs font-medium text-muted-foreground">
              Creative brief & visual bible
            </summary>
            <form
              key={`brief-${g.revision}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  void edit({
                    creativeBrief: JSON.parse(String(f.get("brief"))),
                    visualBible: JSON.parse(String(f.get("bible"))),
                  });
                } catch {
                  setError("Enter valid JSON for the brief and visual bible.");
                }
              }}
            >
              <label className="mb-4 block">
                <span className={labelClass}>Creative brief (JSON)</span>
                <textarea
                  name="brief"
                  defaultValue={JSON.stringify(g.creativeBrief, null, 2)}
                  className={`${textareaClass} min-h-[200px] text-sm`}
                />
              </label>
              <label className="mb-4 block">
                <span className={labelClass}>Visual bible (JSON)</span>
                <textarea
                  name="bible"
                  defaultValue={JSON.stringify(g.visualBible, null, 2)}
                  className={`${textareaClass} min-h-[160px] text-sm`}
                />
              </label>
              <Button disabled={busy || locked}>Save creative direction</Button>
            </form>
          </details>
          <h2 className="mb-4 mt-5 text-lg font-semibold">Scenes</h2>
          {scenes.map((scene) => (
            <form
              className="mb-3.5 rounded-lg border border-border bg-card p-4"
              key={`${scene.id}-${scene.updatedAt}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void edit({
                  scene: {
                    id: scene.id,
                    title: String(f.get("title")),
                    narration: String(f.get("narration")),
                  },
                });
              }}
            >
              <label className="mb-4 block">
                <span className={labelClass}>Scene {scene.position + 1}</span>
                <Input name="title" defaultValue={scene.title} required />
              </label>
              <textarea
                name="narration"
                defaultValue={scene.narration}
                className={`${textareaClass} min-h-[110px] text-sm`}
              />
              <Button
                size="sm"
                variant="outline"
                className="mt-5"
                disabled={busy || locked}
              >
                Save scene
              </Button>
            </form>
          ))}
        </div>
      ) : (
        <div className="max-w-[720px]">
          <Card className="px-6">
            <h2 className="text-lg font-semibold">Sound & subtitles</h2>
            <p className="text-sm text-muted-foreground">
              One continuous narration track keeps your story coherent.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {(["narration", "music"] as const).map((kind) => (
                <div
                  className="rounded-lg border border-dashed border-border p-4"
                  key={kind}
                >
                  <strong className="text-sm font-semibold">
                    {kind === "narration" ? "Narration recording" : "Background music"}
                  </strong>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {kind === "narration"
                      ? "The recording’s real duration drives the final timeline."
                      : "Mixed quietly below narration."}{" "}
                    MP3, WAV, FLAC, OGG or MP4 · 50 MB max.
                  </p>
                  {(kind === "narration" ? g.narrationId : g.musicId) && (
                    <audio
                      className="h-8 w-full"
                      controls
                      src={`/api/media/${kind === "narration" ? g.narrationId : g.musicId}`}
                    />
                  )}
                  <Input
                    aria-label={`Upload ${kind}`}
                    type="file"
                    accept="audio/*,video/mp4"
                    disabled={busy || locked}
                    className="mt-3 h-auto w-full py-1.5 text-xs"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const f = new FormData();
                        f.set("kind", kind);
                        f.set("file", file);
                        void act("upload", f);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
            <div className={noticeClass}>
              Agnes has no documented standalone narration API. Upload your voiceover,
              or use the estimated script timing. After uploading narration, rebuild the
              draft storyboard to rebalance shots before generating.
            </div>
            <label className="my-4 flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={g.burnCaptions}
                disabled={busy || locked}
                onChange={(e) => void edit({ burnCaptions: e.target.checked })}
              />
              Burn captions into final video
            </label>
            <label className="my-4 flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={g.clipAudio}
                disabled={busy || locked}
                onChange={(e) => void edit({ clipAudio: e.target.checked })}
              />
              Keep original clip audio at low volume
            </label>
            <small className="text-xs text-muted-foreground">
              Captions use estimated phrase timing, high contrast, and a mobile-safe
              lower margin.
            </small>
          </Card>
          {renders.length > 0 && (
            <Card className="mt-5 gap-2 px-6">
              <h2 className="text-lg font-semibold">Render history</h2>
              {renders.map((r, i) => (
                <Fragment key={r.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between gap-3 py-4">
                    <span className="flex items-center gap-2 text-sm">
                      Version {r.version} <StatusPill status={r.status} />
                    </span>
                    {r.assetId && (
                      <a
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                        href={`/api/media/${r.assetId}?download=1`}
                      >
                        Download MP4
                      </a>
                    )}
                  </div>
                </Fragment>
              ))}
            </Card>
          )}
        </div>
      )}
    </>
  );
}
function ShotEditor({
  shot,
  data,
  busy,
  save,
  act,
}: {
  shot: Shot;
  data: Detail;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
  act: Action;
}) {
  const active = ["QUEUED", "SUBMITTING", "SUBMITTED", "GENERATING"].includes(
      shot.status,
    ),
    disabled = busy || active;
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Shot {shot.position + 1}</h2>
        <StatusPill status={shot.status} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          // The shadcn Select submits through a hidden native select; "none" is its
          // stand-in for the empty option the API expects as null.
          const read = (key: string) => {
            const v = String(f.get(key) ?? "");
            return v === NONE ? "" : v;
          };
          void save({
            shot: {
              id: shot.id,
              data: {
                visualDescription: String(f.get("visualDescription")),
                videoPrompt: String(f.get("videoPrompt")),
                duration: Number(f.get("duration")),
                mode: read("mode"),
                transition: read("transition"),
                camera: String(f.get("camera")),
                environment: String(f.get("environment")),
                referenceId: read("referenceId") || null,
                characterId: read("characterId") || null,
                continuityFrom: read("continuityFrom") || null,
              },
            },
          });
        }}
      >
        <label className="mb-3.5 block">
          <span className={labelClass}>Visual description</span>
          <textarea
            name="visualDescription"
            defaultValue={shot.visualDescription}
            required
            maxLength={4000}
            className={`${textareaClass} min-h-[100px] text-xs`}
          />
        </label>
        <label className="mb-3.5 block">
          <span className={labelClass}>Video prompt</span>
          <textarea
            name="videoPrompt"
            defaultValue={shot.videoPrompt}
            required
            maxLength={8000}
            className={`${textareaClass} min-h-[150px] text-xs`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="mb-3.5 block">
            <span className={labelClass}>Seconds</span>
            <Input
              name="duration"
              type="number"
              min={4}
              max={12}
              defaultValue={shot.duration}
              required
            />
          </label>
          <label className="mb-3.5 block">
            <span className={labelClass}>Mode</span>
            <InspectorSelect
              key={`${shot.id}-mode`}
              name="mode"
              initial={shot.mode}
              options={MODE_OPTIONS}
            />
          </label>
        </div>
        <details>
          <summary className="cursor-pointer py-3.5 text-xs font-medium text-muted-foreground">
            Continuity & direction
          </summary>
          <label className="mb-3.5 block">
            <span className={labelClass}>Camera</span>
            <Input name="camera" defaultValue={shot.camera} />
          </label>
          <label className="mb-3.5 block">
            <span className={labelClass}>Environment</span>
            <Input name="environment" defaultValue={shot.environment} />
          </label>
          <label className="mb-3.5 block">
            <span className={labelClass}>Character</span>
            <InspectorSelect
              key={`${shot.id}-character`}
              name="characterId"
              initial={shot.characterId || NONE}
              options={[
                { value: NONE, label: "None" },
                ...data.characters.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </label>
          <label className="mb-3.5 block">
            <span className={labelClass}>Reference image</span>
            <InspectorSelect
              key={`${shot.id}-reference`}
              name="referenceId"
              initial={shot.referenceId || NONE}
              options={[
                { value: NONE, label: "None" },
                ...data.assets
                  .filter((a) => a.kind === "reference")
                  .map((a, i) => ({ value: a.id, label: `Reference ${i + 1}` })),
              ]}
            />
          </label>
          <label className="mb-3.5 block">
            <span className={labelClass}>Continue from final frame</span>
            <InspectorSelect
              key={`${shot.id}-continuity`}
              name="continuityFrom"
              initial={shot.continuityFrom || NONE}
              options={[
                { value: NONE, label: "No frame continuity" },
                ...data.shots
                  .filter((s) => s.position < shot.position)
                  .map((s) => ({ value: s.id, label: `Shot ${s.position + 1}` })),
              ]}
            />
          </label>
          <label className="mb-3.5 block">
            <span className={labelClass}>Transition to next shot</span>
            <InspectorSelect
              key={`${shot.id}-transition`}
              name="transition"
              initial={shot.transition}
              options={TRANSITION_OPTIONS}
            />
          </label>
        </details>
        <Button className="w-full" disabled={disabled}>
          <TickCircle size={16} />
          Save changes
        </Button>
      </form>
      <label className="mt-5 block">
        <span className={labelClass}>Upload a reference image</span>
        <Input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          className="h-auto w-full py-1.5 text-xs"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const f = new FormData();
              f.set("kind", "reference");
              f.set("file", file);
              void act("upload", f);
            }
          }}
        />
      </label>
      {shot.lastError && <div className={errorClass}>{shot.lastError}</div>}
      <Button
        variant="outline"
        className="w-full"
        disabled={disabled}
        onClick={() => {
          const uncertain = shot.status === "UNCERTAIN";
          if (
            uncertain &&
            !confirm(
              "The previous request may have succeeded. Check your Agnes account first. Submit again and accept possible duplicate charges?",
            )
          )
            return;
          void act("generate", {
            shotId: shot.id,
            acknowledgeUncertain: uncertain,
          });
        }}
      >
        <Refresh size={15} />
        {shot.clipId ? "Regenerate this shot" : "Generate this shot"}
      </Button>
      <div className="mt-5 flex items-center justify-between gap-3">
        {[
          ["up", ArrowUp2, "Move up"],
          ["down", ArrowDown2, "Move down"],
          ["duplicate", Copy, "Duplicate"],
          ["delete", Trash, "Delete"],
        ].map(([op, Icon, label]) => {
          const I = Icon as typeof Trash;
          return (
            <Button
              key={String(op)}
              type="button"
              variant="ghost"
              size="sm"
              title={String(label)}
              aria-label={String(label)}
              disabled={disabled}
              onClick={() => {
                if (
                  op === "delete" &&
                  !confirm("Delete this shot from the storyboard?")
                )
                  return;
                void save({ operation: op, shotId: shot.id });
              }}
            >
              <I size={16} />
            </Button>
          );
        })}
      </div>
    </Card>
  );
}
