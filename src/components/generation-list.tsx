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
  Trash,
} from "iconsax-react";
import { api } from "./client-api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
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
      <header className="page-top">
        <div>
          <div className="eyebrow">Your workspace</div>
          <h1>{overview ? "Overview" : "Generations"}</h1>
          <p>
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
        <div className="stats">
          {[
            ["Total generations", total, VideoHorizontal],
            ["In progress", active, Clock],
            ["Completed", complete, TickCircle],
            ["Failed", failed, CloseCircle],
          ].map(([label, count, Icon]) => {
            const I = Icon as typeof Clock;
            return (
              <Card key={String(label)}>
                <div className="stat-label">
                  {String(label)}
                  <I size={17} />
                </div>
                <div className="stat-number">{String(count)}</div>
              </Card>
            );
          })}
        </div>
      )}
      <div className="section-title">
        <h2>{overview ? "Recent generations" : "Your projects"}</h2>
        {overview && (
          <Link className="text-link" href="/generations">
            View all <ArrowRight size={13} style={{ display: "inline" }} />
          </Link>
        )}
      </div>
      {!overview && (
        <div className="filters">
          <Input
            aria-label="Search generations"
            placeholder="Search by title or topic…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Filter status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
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
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Sort generations"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <div className="loading" />
      ) : !data.items.length ? (
        <div className="empty">
          <VideoPlay size={40} style={{ margin: "auto" }} />
          <h2>{search ? "No matching projects" : "Your first story starts here"}</h2>
          <p>
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
        <div className="grid">
          {data.items.map((g) => (
            <Card className="generation-card" key={g.id}>
              <Link href={`/generations/${g.id}`}>
                <div className="poster">
                  {g.thumbnailId ? (
                    <img
                      src={`/api/media/${g.thumbnailId}`}
                      alt={`${g.title} thumbnail`}
                      loading="lazy"
                    />
                  ) : (
                    <VideoPlay size={34} variant="Linear" />
                  )}
                </div>
                <div className="generation-body">
                  <div className="row spread">
                    <Badge status={g.status} />
                    <small>
                      {g.aspectRatio} · {g.targetDuration}s
                    </small>
                  </div>
                  <h3>{g.title}</h3>
                  <div className="meta">
                    <span>{g.contentFormat}</span>
                    <span>·</span>
                    <span>
                      {new Date(g.createdAt).toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <small>
                    Updated {new Date(g.updatedAt).toLocaleDateString("en")}
                  </small>
                </div>
              </Link>
              {!overview && (
                <div style={{ padding: "0 18px 14px" }}>
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
        <div className="pagination">
          <small>
            {data.total} projects · Page {page}
          </small>
          <div className="row">
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
