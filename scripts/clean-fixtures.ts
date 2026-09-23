import "dotenv/config";
import { pool } from "../src/db";
import { storage } from "../src/storage";
// Removes every verification identity and its media. Only reserved example.invalid
// addresses are touched, so no real account can ever be deleted by this script.
const users = await pool.query<{ id: string; email: string }>(
  "select id, email from users where email like '%@example.invalid'",
);
for (const user of users.rows) {
  await storage.remove(`users/${user.id}`);
  await pool.query("delete from users where id = $1", [user.id]);
}
const remaining = await pool.query<{ count: number }>(
  "select count(*)::int as count from users",
);
console.log(
  JSON.stringify({
    removedFixtureUsers: users.rows.length,
    emails: users.rows.map((user) => user.email),
    remainingUsers: remaining.rows[0].count,
  }),
);
await pool.end();
