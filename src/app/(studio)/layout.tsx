import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";
import { Shell } from "@/components/shell";
import { creditsFor } from "@/credits/service";
export const dynamic = "force-dynamic";
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const credits = await creditsFor(user.id);
  return (
    <Shell user={{ name: user.name, email: user.email }} credits={credits}>
      {children}
    </Shell>
  );
}
