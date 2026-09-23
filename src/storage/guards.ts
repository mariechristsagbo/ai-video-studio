// Serverless platforms give the application a read-only filesystem apart from an ephemeral
// /tmp, so local media storage would lose data between invocations. Checked both when the
// driver is created and while the Next.js config is evaluated, so a bad deploy fails loudly.
export const SERVERLESS_STORAGE_MESSAGE =
  "Serverless deployments have an ephemeral filesystem, so media would disappear. Set STORAGE_DRIVER=cloudinary with the CLOUDINARY_* settings (see docs/deploy-vercel.md).";
export function assertServerlessStorage(env: Record<string, string | undefined>) {
  if (env.VERCEL && (env.STORAGE_DRIVER ?? "local") === "local")
    throw new Error(SERVERLESS_STORAGE_MESSAGE);
}
