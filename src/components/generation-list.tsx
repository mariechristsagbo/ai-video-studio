"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  VideoPlay,
  Add,
  ArrowRight,
  Clock,
  TickCircle,
  CloseCircle,
  VideoHorizontal,
  SearchNormal,
  Trash,
} from "iconsax-react";
import { api } from "./client-api";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SelectLabel } from "./select-label";
type Summary = {
  id: string;
  title: string;
  status: string;
  aspectRatio: string;
  targetDuration: number;
  contentFormat: string;
  createdAt: string;
  updatedAt: string;
  thumbnailId: string | null;
};
type Data = {
  items: Summary[];
  total: number;
  page: number;
  counts?: { status: string; count: number }[];
};
const gridClass = "grid gap-5 sm:grid-cols-2 xl:grid-cols-3";
const statsGridClass = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
const cardClass = "gap-0 overflow-hidden p-0 transition-colors hover:border-primary/40";
const statusLabel = (value: string) =>
  value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (c) => c.toUpperCase())
    : "All statuses";
const statusStyles = (status: string) =>
  status === "COMPLETED"
    ? "border-primary/20 bg-primary/10 text-primary"
    : status === "FAILED" || status === "UNCERTAIN"
      ? "border-destructive/20 bg-destructive/10 text-destructive"
      : "text-muted-foreground";
export function GenerationList({ overview = false }: { overview?: boolean }) {
  const [data, setData] = useState<Data>(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [sort, setSort] = useState("newest"),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Data>(
        overview
          ? "overview"
          : `generations?page=${page}&search=${encodeURIComponent(search)}&status=${status}&sort=${sort}`,
      )
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    const timeout = setTimeout(load, 200),
      timer = setInterval(load, 7000);
    return () => {
      active = false;
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [overview, page, search, status, sort]);
  const total = data?.counts?.reduce((n, c) => n + c.count, 0) || 0,
    complete = data?.counts?.find((c) => c.status === "COMPLETED")?.count || 0,
    failed = data?.counts?.find((c) => c.status === "FAILED")?.count || 0,
    active =
      data?.counts
        ?.filter((c) =>
          ["PLANNING", "QUEUED", "GENERATING", "RENDERING"].includes(c.status),
        )
        .reduce((n, c) => n + c.count, 0) || 0;
  return (
    <>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {overview ? "Overview" : "Generations"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {overview
              ? "A little curiosity. A compelling story. Your next video."
              : "Every idea, storyboard, and finished film in one place."}
          </p>
        </div>
        <Button asChild>
          <Link href="/generations/new">
            <Add size={18} />
            New generation
          </Link>
        </Button>
      </header>
      {overview && (
        <div className={`${statsGridClass} mb-8`}>
          {[
            ["Total generations", total, VideoHorizontal],
            ["In progress", active, Clock],
            ["Completed", complete, TickCircle],
            ["Failed", failed, CloseCircle],
          ].map(([label, count, Icon]) => {
            const I = Icon as typeof Clock;
            return (
              <Card key={String(label)} className="gap-0 py-5">
                <CardContent className="px-5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    {String(label)}
                    <I size={17} />
                  </div>
                  <div className="mt-4 text-3xl font-medium tracking-tight">
                    {String(count)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">
          {overview ? "Recent generations" : "Your projects"}
        </h2>
        {overview && (
          <Link
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            href="/generations"
          >
            View all <ArrowRight size={13} className="inline" />
          </Link>
        )}
      </div>
      {!overview && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <SearchNormal
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              aria-label="Search generations"
              placeholder="Search by title or topic…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={status || "all"}
            onValueChange={(v) => {
              setStatus(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[190px]" aria-label="Filter status">
              <SelectLabel>{statusLabel(status)}</SelectLabel>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {[
                "DRAFT",
                "PLANNING",
                "STORYBOARD_READY",
                "QUEUED",
                "GENERATING",
                "READY_TO_RENDER",
                "RENDERING",
                "COMPLETED",
                "FAILED",
              ].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[150px]" aria-label="Sort generations">
              <SelectLabel>
                {sort === "oldest" ? "Oldest first" : "Newest first"}
              </SelectLabel>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {error && (
        <div
          className="my-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      )}
      {!data ? (
        // Mirrors the real grid, card and body classes and the 12-item page size.
        <div aria-busy="true">
          {overview && (
            <div className={`${statsGridClass} mb-8`}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Card key={index} className="gap-0 py-5">
                  <CardContent className="px-5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-4 h-8 w-16" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <div className={gridClass}>
            {Array.from({ length: 12 }).map((_, index) => (
              <Card key={index} className={cardClass}>
                <Skeleton className="aspect-video w-full rounded-none" />
                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                {!overview && (
                  <div className="px-5 pb-4">
                    <Skeleton className="h-8 w-24" />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : !data.items.length ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <VideoPlay size={40} className="mx-auto text-muted-foreground" />
          <h2 className="mt-5 mb-2 text-lg font-semibold tracking-tight">
            {search ? "No matching projects" : "Your first story starts here"}
          </h2>
          <p className="mx-auto mb-6 max-w-sm text-sm text-muted-foreground">
            Give your curiosity a canvas. Create a video from an idea, one scene at a
            time.
          </p>
          <Button asChild>
            <Link href="/generations/new">
              <Add size={17} />
              Create a generation
            </Link>
          </Button>
        </div>
      ) : (
        <div className={gridClass}>
          {data.items.map((g) => (
            <Card key={g.id} className={cardClass}>
              <Link href={`/generations/${g.id}`}>
                <div className="flex aspect-video items-center justify-center overflow-hidden bg-muted text-muted-foreground">
                  {g.thumbnailId ? (
                    <img
                      src={`/api/media/${g.thumbnailId}`}
                      alt={`${g.title} thumbnail`}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <VideoPlay size={34} variant="Linear" />
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant="outline"
                      className={`capitalize ${statusStyles(g.status)}`}
                    >
                      {g.status.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                    <small className="text-xs text-muted-foreground">
                      {g.aspectRatio} · {g.targetDuration}s
                    </small>
                  </div>
                  <h3 className="text-[15px] leading-snug font-semibold">{g.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{g.contentFormat}</span>
                    <span>·</span>
                    <span>
                      {new Date(g.createdAt).toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <small className="block text-xs text-muted-foreground">
                    Updated {new Date(g.updatedAt).toLocaleDateString("en")}
                  </small>
                </div>
              </Link>
              {!overview && (
                <div className="px-5 pb-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (
                        !confirm(
                          "Delete this generation and all its media? This cannot be undone.",
                        )
                      )
                        return;
                      try {
                        await api(`generations/${g.id}/delete`, {});
                        setData({
                          ...data,
                          items: data.items.filter((i) => i.id !== g.id),
                          total: data.total - 1,
                        });
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <Trash size={13} />
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {!overview && data && (
        <div className="mt-7 flex items-center justify-between gap-4">
          <small className="text-xs text-muted-foreground">
            {data.total} {data.total === 1 ? "project" : "projects"} · Page {page}
          </small>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 12 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
