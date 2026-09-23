import { and, count, eq, gte } from "drizzle-orm";
import { db } from "../db";
import { generations } from "../db/schema";
import { monthStart, monthlyAllowance, remainingCredits } from "./allowance";

export type Credits = { used: number; allowance: number; remaining: number };

/** Credits are the generations started in the current month against the configured allowance. */
export async function creditsFor(userId: string): Promise<Credits> {
  const [row] = await db
    .select({ used: count() })
    .from(generations)
    .where(and(eq(generations.userId, userId), gte(generations.createdAt, monthStart())));
  const used = Number(row?.used ?? 0),
    allowance = monthlyAllowance();
  return { used, allowance, remaining: remainingCredits(used, allowance) };
}
