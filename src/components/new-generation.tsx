"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Magicpen } from "iconsax-react";
import { api } from "./client-api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input, Textarea } from "./ui/input";
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
export function NewGeneration() {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="form-wrap">
      <header className="page-top">
        <div>
          <div className="eyebrow">From curiosity to cinema</div>
          <h1>Start with an idea</h1>
          <p>We’ll turn your topic into a script and a shot-by-shot storyboard.</p>
        </div>
      </header>
      <Card>
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
          <label className="field">
            <span>What’s your video about?</span>
            <Textarea
              name="topic"
              required
              minLength={8}
              maxLength={2000}
              placeholder="What would happen if the Internet disappeared for 24 hours?"
            />
            <div className="help">
              A question, an unexpected fact, or a world you want to explore.
            </div>
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Target duration</span>
              <select name="targetDuration" className="input" defaultValue="60">
                {[
                  [30, "30 seconds"],
                  [60, "60 seconds"],
                  [90, "90 seconds"],
                  [180, "3 minutes"],
                  [300, "5 minutes"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Language</span>
              <Input name="language" defaultValue="English" required maxLength={60} />
            </label>
            <label className="field">
              <span>Platform</span>
              <select name="platform" className="input">
                {["TikTok", "YouTube Shorts", "Instagram Reels", "YouTube"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Aspect ratio</span>
              <select name="aspectRatio" className="input">
                <option value="9:16">9:16 · Vertical</option>
                <option value="16:9">16:9 · Landscape</option>
                <option value="1:1">1:1 · Square</option>
              </select>
            </label>
            <label className="field">
              <span>Content format</span>
              <select name="contentFormat" className="input">
                {formats.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Visual style</span>
              <select name="visualStyle" className="input">
                {styles.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <details>
            <summary>Advanced · Custom instructions</summary>
            <Textarea
              name="customInstructions"
              maxLength={4000}
              placeholder="Audience, tone, visual direction, facts to include or avoid…"
            />
          </details>
          <div className="notice">
            <Magicpen size={16} style={{ display: "inline", marginRight: 7 }} />
            You’ll review your script and storyboard before any video clips are
            generated.
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="form-footer">
            <small>Planning first. You stay in control.</small>
            <Button disabled={busy}>
              {busy ? "Creating…" : "Create storyboard"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
