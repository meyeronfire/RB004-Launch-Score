import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "rb004_admin";
export function adminCookieToken() {
  const secret = process.env.ADMIN_SECRET;
  return secret ? createHash("sha256").update(`rb004-admin:${secret}`).digest("hex") : "";
}
export function validAdminCookie(value: string | undefined) {
  const expected = adminCookieToken(); if (!expected || !value) return false;
  const a = Buffer.from(expected); const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}
