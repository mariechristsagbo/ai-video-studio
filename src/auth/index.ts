import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import { db } from "../db";
import * as schema from "../db/schema";
export type MailBoundary = (mail: { email: string; url: string }) => Promise<void>;
export function createAuth(sendMail?: MailBoundary) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: true, window: 60, max: 10 },
    plugins: [
      magicLink({
        expiresIn: 600,
        sendMagicLink: async ({ email, url }) => {
          if (sendMail) return sendMail({ email, url });
          if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)
            throw new Error("Email delivery is not configured");
          const escaped = url
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;");
          const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: email,
            subject: "Sign in to AI Video Studio",
            text: `AI Video Studio\nSign in: ${url}\nThis link expires in 10 minutes. Ignore this email if you did not request it.`,
            html: `<h1>AI Video Studio</h1><p><a href="${escaped}">Sign in to your studio</a></p><p>This link expires in 10 minutes. If you did not request it, ignore this email.</p><p>${escaped}</p>`,
          });
          if (result.error) throw new Error("Email delivery failed");
        },
      }),
    ],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function auth() {
  return (instance ??= createAuth());
}
