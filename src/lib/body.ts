import { Readable } from "node:stream";
export async function readFormData(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Upload too large");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of Readable.fromWeb(request.body as never)) {
    size += (chunk as Buffer).length;
    if (size > maxBytes) throw new Error("Upload too large");
    chunks.push(chunk as Buffer);
  }
  return new Request("http://internal", {
    method: "POST",
    headers: { "Content-Type": request.headers.get("content-type") || "" },
    body: Buffer.concat(chunks),
  }).formData();
}
