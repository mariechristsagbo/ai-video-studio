/** Monthly allowance of video generations, shown in the sidebar and configurable per deployment. */
export const DEFAULT_MONTHLY_ALLOWANCE = 20;

export function monthlyAllowance(env: Record<string, string | undefined> = process.env) {
  const parsed = Number.parseInt(env.MONTHLY_CREDIT_ALLOWANCE ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MONTHLY_ALLOWANCE;
}

export function remainingCredits(used: number, allowance = monthlyAllowance()) {
  return Math.max(0, allowance - Math.max(0, Math.floor(used)));
}

export function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
