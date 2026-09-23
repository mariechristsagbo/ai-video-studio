import { expect, it } from "vitest";
import {
  DEFAULT_MONTHLY_ALLOWANCE,
  monthStart,
  monthlyAllowance,
  remainingCredits,
} from "../src/credits/allowance";

it("defaults the allowance when the variable is missing or unusable", () => {
  expect(monthlyAllowance({})).toBe(DEFAULT_MONTHLY_ALLOWANCE);
  expect(monthlyAllowance({ MONTHLY_CREDIT_ALLOWANCE: "12" })).toBe(12);
  expect(monthlyAllowance({ MONTHLY_CREDIT_ALLOWANCE: "0" })).toBe(0);
  expect(monthlyAllowance({ MONTHLY_CREDIT_ALLOWANCE: "many" })).toBe(DEFAULT_MONTHLY_ALLOWANCE);
  expect(monthlyAllowance({ MONTHLY_CREDIT_ALLOWANCE: "-3" })).toBe(DEFAULT_MONTHLY_ALLOWANCE);
});

it("never reports negative credits", () => {
  expect(remainingCredits(3, 20)).toBe(17);
  expect(remainingCredits(20, 20)).toBe(0);
  expect(remainingCredits(25, 20)).toBe(0);
});

it("counts the month from the first day", () => {
  const start = monthStart(new Date(2026, 8, 23, 21, 30));
  expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 8, 1]);
});
