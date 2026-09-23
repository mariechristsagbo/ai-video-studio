import "dotenv/config";
import { pool } from "../src/db";
import { getRedis } from "../src/queues/redis";
import { readRoute } from "../src/generations/api-service";
const [{ id }] = (
  await pool.query(
    "insert into users (id, name, email, email_verified) values (gen_random_uuid()::text, $1, $2, true) returning id",
    ["Settings check", "settings-check@example.invalid"],
  )
).rows;
try {
  const payload = await readRoute(
    id,
    ["settings"],
    new URL("http://localhost/api/studio/settings"),
  );
  console.log(JSON.stringify(payload, null, 2));
} finally {
  await pool.query("delete from users where id = $1", [id]);
  getRedis().disconnect();
  await pool.end();
}
process.exit(0);
