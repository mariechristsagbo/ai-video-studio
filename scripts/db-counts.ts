import "dotenv/config";
import { pool } from "../src/db";
// Lightweight inventory used to confirm that smoke fixtures leave no residue.
const tables = [
  "users",
  "generations",
  "scenes",
  "shots",
  "renders",
  "assets",
  "jobs",
  "characters",
];
const counts: Record<string, number> = {};
for (const table of tables) {
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from ${table}`,
  );
  counts[table] = result.rows[0].count;
}
console.log(JSON.stringify(counts));
await pool.end();
