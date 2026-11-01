import { sessionCookie, verifyFreeMagicLink } from "@/lib/free-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-zA-Z0-9_-]{40,60}$/.test(token)) return Response.redirect(new URL("/?free=invalid", request.url), 303);
  const verified = await verifyFreeMagicLink(token);
  if (!verified || verified.exhausted) return Response.redirect(new URL(verified?.exhausted ? "/?free=used" : "/?free=invalid", request.url), 303);
  const response = Response.redirect(new URL("/?free=verified", request.url), 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.append("Set-Cookie", sessionCookie(verified.session));
  return response;
}
