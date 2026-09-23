import { headers } from "next/headers";
import { auth } from "./index";
export async function currentUser() {
  const session = await auth().api.getSession({ headers: await headers() });
  return session?.user ?? null;
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
