export async function readBoundedBody(request: Request, limit: number) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > limit) return { body: undefined, error: "too_large" as const };
  if (!request.body) return { body: "", error: "empty" as const };
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); return { body: undefined, error: "too_large" as const }; }
      chunks.push(part.value);
    }
  } catch { return { body: undefined, error: "read_failed" as const }; }
  return { body: Buffer.concat(chunks.map((part) => Buffer.from(part))).toString("utf8"), error: undefined };
}
