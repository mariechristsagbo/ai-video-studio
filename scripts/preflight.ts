import "dotenv/config";
import { Pool } from "pg";
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
try {
  const result = await pool.query(
    "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name",
  );
  console.log(JSON.stringify({ databaseConnected: true, tables: result.rows }));
} catch {
  console.log(JSON.stringify({ databaseConnected: false }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
if (process.env.RESEND_API_KEY) {
  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    const body = await r.json();
    console.log(
      JSON.stringify({
        resendStatus: r.status,
        domains:
          body.data?.map((d: { name: string; status: string }) => ({
            name: d.name,
            status: d.status,
          })) ?? [],
      }),
    );
  } catch {
    console.log(JSON.stringify({ resendReachable: false }));
  }
}
