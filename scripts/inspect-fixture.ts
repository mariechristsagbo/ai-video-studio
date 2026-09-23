import "dotenv/config";
import { pool } from "../src/db";
const id = "21c6cfdd-8bf5-484b-a423-9659c1df28b3";
const jobs = await pool.query(
  "select id,kind,status,provider_id,attempts,polls,run_after,error from jobs where generation_id=$1 order by created_at",
  [id],
);
console.log(
  JSON.stringify(
    jobs.rows.map((r) => ({
      kind: r.kind,
      status: r.status,
      submitted: !!r.provider_id,
      attempts: r.attempts,
      polls: r.polls,
      error: r.error,
    })),
    null,
    1,
  ),
);
const shots = await pool.query(
  "select position,status,version,clip_id is not null as has_clip from shots where generation_id=$1 order by position",
  [id],
);
console.log(JSON.stringify(shots.rows));
console.log(
  JSON.stringify(
    (await pool.query("select status,error from generations where id=$1", [id])).rows,
  ),
);
await pool.end();
