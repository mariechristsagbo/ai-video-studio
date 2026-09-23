export async function api<T = unknown>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    `/api/studio/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers:
            body instanceof FormData ? {} : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data as T;
}
