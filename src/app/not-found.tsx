import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">That page does not exist</h1>
        <p className="text-sm text-muted-foreground">
          The project or route you asked for is not available.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to overview</Link>
        </Button>
      </div>
    </div>
  );
}
