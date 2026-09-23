import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return <Shell user={{ name: user.name, email: user.email }}>{children}</Shell>;
}
