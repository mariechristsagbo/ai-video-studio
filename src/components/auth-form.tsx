"use client";
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sms, ArrowRight } from "iconsax-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
const labelClass = "mb-2 block text-sm font-medium text-foreground";
export function AuthForm({ signup = false }: { signup?: boolean }) {
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="grid min-h-screen place-items-center bg-secondary/40 p-6">
      <Card className="w-full max-w-[420px] p-8">
        <Link
          className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight"
          href="/"
        >
          <Image
            src="/brio-mark.png"
            alt=""
            width={28}
            height={28}
            priority
            className="size-7"
          />
          Brio
        </Link>
        {sent ? (
          <>
            <Sms size={40} className="text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
            <p className="text-sm text-muted-foreground">
              Your secure sign-in link is on its way. It expires in 10 minutes.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
              Use another email
            </Button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              {signup ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              Turn an idea into a story worth watching.
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                setBusy(true);
                setError("");
                const form = new FormData(event.currentTarget);
                try {
                  const response = await fetch("/api/auth/sign-in/magic-link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: form.get("email"),
                      name: form.get("name") || undefined,
                      callbackURL: "/dashboard",
                      newUserCallbackURL: "/dashboard",
                    }),
                  });
                  if (!response.ok) throw new Error();
                  setSent(true);
                } catch {
                  setError(
                    "We could not send your link. Please try again or check email configuration.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {signup && (
                <label className="mb-4 block">
                  <span className={labelClass}>Name</span>
                  <Input
                    name="name"
                    autoComplete="name"
                    placeholder="Your name"
                    required
                    maxLength={100}
                  />
                </label>
              )}
              <label className="mb-4 block">
                <span className={labelClass}>Email address</span>
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                >
                  {error}
                </div>
              )}
              <Button className="w-full" disabled={busy}>
                {busy ? "Sending link…" : "Continue with email"}
                <ArrowRight size={16} />
              </Button>
            </form>
            <div className="text-center text-sm text-muted-foreground">
              {signup ? "Already have an account?" : "New here?"}{" "}
              <Link href={signup ? "/sign-in" : "/sign-up"} className="underline">
                {signup ? "Sign in" : "Create an account"}
              </Link>
              <p className="mt-5">No passwords. Just a secure link to your inbox.</p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
