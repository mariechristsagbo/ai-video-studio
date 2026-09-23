"use client";
import { useState, useEffect } from "react";
import { Profile2User, Add } from "iconsax-react";
import { api } from "./client-api";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import type { characters } from "@/db/schema";
type Character = typeof characters.$inferSelect;
const labelClass = "mb-2 block text-sm font-medium text-foreground";
const textareaClass =
  "w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
export function Characters() {
  const [list, setList] = useState<Character[]>([]),
    [editing, setEditing] = useState<Character>(),
    [reference, setReference] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = () => api<Character[]>("characters").then(setList);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <header className="mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Reusable identities for a visually consistent story.
          </p>
        </div>
      </header>
      {error && (
        <div className="my-3 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {!list.length ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-[70px] text-center text-muted-foreground">
              <Profile2User size={38} className="mx-auto block" />
              <h2 className="mb-2 mt-5 text-lg font-semibold text-foreground">
                Build your cast
              </h2>
              <p className="mx-auto max-w-[380px] text-sm text-muted-foreground">
                Create reusable characters to keep visual identity consistent across
                generations.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {list.map((c) => (
                <Card className="p-6" key={c.id}>
                  {c.referenceId && (
                    <img
                      className="mb-4 h-[150px] w-full rounded-lg object-cover"
                      src={`/api/media/${c.referenceId}`}
                      alt={c.name}
                    />
                  )}
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                  <small className="text-xs text-muted-foreground">
                    Created {new Date(c.createdAt).toLocaleDateString("en")}
                  </small>
                  <div className="mt-5 flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditing(c);
                        setReference(c.referenceId);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm("Delete this reusable character?")) return;
                        try {
                          await api(`characters/${c.id}/delete`, c);
                          await load();
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <Card className="px-6">
          <h2 className="text-lg font-semibold">
            {editing ? "Edit character" : "New character"}
          </h2>
          <form
            key={editing?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const data = Object.fromEntries(new FormData(e.currentTarget));
              try {
                await api(editing ? `characters/${editing.id}` : "characters", {
                  ...data,
                  referenceId: reference,
                });
                setEditing(undefined);
                setReference(null);
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="mb-4 block">
              <span className={labelClass}>Name</span>
              <Input
                name="name"
                defaultValue={editing?.name}
                required
                placeholder="The Archivist"
                maxLength={100}
              />
            </label>
            <label className="mb-4 block">
              <span className={labelClass}>Description</span>
              <textarea
                name="description"
                defaultValue={editing?.description}
                required
                placeholder="Who is this character?"
                maxLength={3000}
                className={`${textareaClass} min-h-[110px]`}
              />
            </label>
            <label className="mb-4 block">
              <span className={labelClass}>Stable visual prompt</span>
              <textarea
                name="visualPrompt"
                defaultValue={editing?.visualPrompt}
                required
                placeholder="Appearance, clothing, distinctive features…"
                maxLength={3000}
                className={`${textareaClass} min-h-[110px]`}
              />
            </label>
            <label className="mb-4 block">
              <span className={labelClass}>Reference image</span>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="h-auto w-full py-1.5 text-xs"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const f = new FormData();
                    f.set("file", file);
                    const result = await api<{ id: string }>("characters/upload", f);
                    setReference(result.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              {reference && (
                <small className="mt-2 block text-xs text-muted-foreground">
                  Reference image attached
                </small>
              )}
            </label>
            <Button disabled={busy} className="w-full">
              <Add size={16} />
              {editing ? "Save character" : "Create character"}
            </Button>
            {editing && (
              <Button
                variant="ghost"
                type="button"
                className="mt-2 w-full"
                onClick={() => {
                  setEditing(undefined);
                  setReference(null);
                }}
              >
                Cancel
              </Button>
            )}
          </form>
        </Card>
      </div>
    </>
  );
}
