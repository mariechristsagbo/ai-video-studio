import "dotenv/config";
import { pool } from "../src/db";
console.log(
  "users",
  (await pool.query("select id,email,created_at from users order by created_at")).rows,
);
console.log(
  "generations",
  (
    await pool.query(
      "select id,user_id,title,status,deleted_at,topic from generations order by created_at",
    )
  ).rows,
);
console.log("sessions", (await pool.query("select count(*)::int from sessions")).rows);
await pool.end();
