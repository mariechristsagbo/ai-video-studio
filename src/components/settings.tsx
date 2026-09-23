"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { TickCircle } from "iconsax-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { api } from "./client-api";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "./ui/form";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60, "60 characters maximum."),
  lastName: z.string().trim().min(1, "Enter your last name.").max(60, "60 characters maximum."),
});
type ProfileValues = z.infer<typeof profileSchema>;
type Profile = ProfileValues & { email: string; name: string };

export function Settings() {
  const [profile, setProfile] = useState<Profile>(),
    [error, setError] = useState(""),
    [saveError, setSaveError] = useState(""),
    [saved, setSaved] = useState(false);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: "", lastName: "" },
  });
  useEffect(() => {
    void api<Profile>("profile")
      .then((data) => {
        setProfile(data);
        form.reset({ firstName: data.firstName, lastName: data.lastName });
      })
      .catch((e: Error) => setError(e.message));
  }, [form]);
  async function onSubmit(values: ProfileValues) {
    setSaved(false);
    setSaveError("");
    try {
      const updated = await api<Profile>("profile", values);
      setProfile(updated);
      form.reset({ firstName: updated.firstName, lastName: updated.lastName });
      setSaved(true);
    } catch (e) {
      setSaveError((e as Error).message);
    }
  }
  return (
    <div className="max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your profile details, used in the studio and on shared documents.
        </p>
      </header>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!profile && !error ? (
        <SettingsSkeleton />
      ) : (
        profile && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Profile</CardTitle>
                  <CardDescription>How you are named across Brio.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First name</FormLabel>
                          <FormControl>
                            <Input autoComplete="given-name" placeholder="Marie" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last name</FormLabel>
                          <FormControl>
                            <Input autoComplete="family-name" placeholder="Sagbo" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input value={profile.email} readOnly disabled />
                    </FormControl>
                    <FormDescription>
                      Your sign-in address. Magic links are sent here, so it cannot be changed from
                      this page.
                    </FormDescription>
                  </FormItem>
                </CardContent>
              </Card>
              <div className="flex items-center gap-4">
                <Button type="submit" disabled={form.formState.isSubmitting || !form.formState.isDirty}>
                  {form.formState.isSubmitting ? "Saving…" : "Save changes"}
                </Button>
                {saved && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <TickCircle size={16} variant="Bold" className="text-primary" />
                    Profile updated.
                  </span>
                )}
                {saveError && <span className="text-sm text-destructive">{saveError}</span>}
              </div>
            </form>
          </Form>
        )
      )}
    </div>
  );
}

// Mirrors the profile form so the page does not jump once the data arrives.
function SettingsSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-2 h-4 w-56" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="space-y-2.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div className="space-y-2.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </CardContent>
    </Card>
  );
}
