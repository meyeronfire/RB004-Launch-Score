import { sessionCookie, verifyFreeMagicLink } from "@/lib/free-tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(url: URL, session?: string) {
  const headers = new Headers({
    Location: url.toString(),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  if (session) headers.append("Set-Cookie", sessionCookie(session));
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-zA-Z0-9_-]{40,60}$/.test(token)) return redirect(new URL("/?free=invalid", request.url));
  const verified = await verifyFreeMagicLink(token);
  if (!verified || verified.exhausted) return redirect(new URL(verified?.exhausted ? "/?free=used" : "/?free=invalid", request.url));
  return redirect(new URL("/?free=verified", request.url), verified.session);
}
