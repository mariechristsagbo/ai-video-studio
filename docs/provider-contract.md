# Agnes contract

Official documentation read in full: https://wiki.agnes-ai.com/en/docs/agnes-video-25.md and https://agnes-ai.com/en/docs/agnes-25-flash. The older `agnes-video-v25` link now returns 404.

**Important correction to older examples:** create returns `video_id`; polling uses `GET /agnesapi?video_id=...&model_name=agnes-video-2.5`, not `/v1/videos/{id}`. Completed media is `metadata.url`, not top-level `url`.

Video creation: POST `/v1/videos`, bearer authentication, `agnes-video-2.5`, `seconds` as a string 4–12, `size=720P`, `n=1`, aspect ratio and mode. Modes: text (no media), keyframe (`first_frame` and/or `last_frame`), reference (`images`, `audios`, `videos` arrays). Video references accept `url`, `start_seconds`, `require_audio`. Media must remain publicly accessible until completion. Signed application URLs grant narrowly scoped temporary access.

The official index https://wiki.agnes-ai.com/llms.txt documents no standalone TTS endpoint. Narration upload is used; no invented TTS endpoint. Text uses chat completions and validated JSON with bounded repair. No undocumented response_format or idempotency headers.

No Agnes key was supplied during implementation. Contract tests use an injected HTTP boundary; they do not demonstrate real provider access or video quality.
