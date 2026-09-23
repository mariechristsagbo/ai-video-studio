"use client";
import { Button } from "@/components/ui/button";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Your workspace is temporarily unavailable
        </h1>
        <p className="text-sm text-muted-foreground">
          Check the database connection and try again.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
