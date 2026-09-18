const COOKIE = "musicbat_buyer";

export async function buyerIdentity(request: Request, create = false) {
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  let token = value && /^[0-9a-f]{64}$/.test(value) ? value : null;
  let cookie: string | null = null;
  if (!token && create) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    cookie = `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api/musicbat/purchase; Max-Age=31536000`;
  }
  if (!token) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return { hash, cookie };
}
