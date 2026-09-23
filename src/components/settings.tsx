"use client";
import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { api } from "./client-api";
type Status = {
  database: boolean;
  redis: boolean;
  ffmpeg: boolean;
  agnes: boolean;
  resend: boolean;
  model: string;
  concurrency: number;
  storage: string;
};
export function Settings() {
  const [data, setData] = useState<Status>(),
    [error, setError] = useState("");
  useEffect(() => {
    void api<Status>("settings")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="max-readable">
      <header className="page-top">
        <div>
          <div className="eyebrow">Under the hood</div>
          <h1>Settings</h1>
          <p>Your studio’s connections and runtime status.</p>
        </div>
      </header>
      {error && <div className="error">{error}</div>}
      <Card>
        <h2>System health</h2>
        {!data ? (
          <div className="loading" />
        ) : (
          <>
            {[
              ["Database", data.database],
              ["Redis queue", data.redis],
              ["FFmpeg", data.ffmpeg],
              ["Agnes API configured", data.agnes],
              ["Resend email configured", data.resend],
            ].map(([label, ok]) => (
              <div className="setting-row" key={String(label)}>
                <span>{String(label)}</span>
                <Badge status={ok ? "COMPLETED" : "FAILED"}>
                  {ok ? "Ready" : "Not configured / unavailable"}
                </Badge>
              </div>
            ))}
            <div className="setting-row">
              <span>Video model</span>
              <small>{data.model}</small>
            </div>
            <div className="setting-row">
              <span>Video concurrency</span>
              <small>{data.concurrency} jobs</small>
            </div>
            <div className="setting-row">
              <span>Storage</span>
              <small>{data.storage}</small>
            </div>
          </>
        )}
      </Card>
      <div className="notice">
        API keys and connection strings are managed server-side through environment
        variables. No secrets are displayed here.
      </div>
    </div>
  );
}
