/** HMAC-signed, expiring tokens (session cookie + candidate portal links). Never guessable IDs. */
import crypto from "node:crypto";

const DEV_SECRET = "trajectory-local-demo-secret-change-me";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.TRAJECTORY_ALLOW_DEV_SECRET !== "1") {
    throw new Error("SESSION_SECRET (≥32 chars) is required in production. Set it in your environment.");
  }
  return DEV_SECRET;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function sign(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verify<T extends Record<string, unknown>>(
  token: string | undefined | null,
): (T & { exp: number }) | null {
  if (!token || !/^[\w-]+\.[\w-]+$/.test(token)) return null;
  const [body, sig] = token.split(".") as [string, string];
  const expected = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return data.exp > Date.now() / 1000 ? data : null;
  } catch {
    return null;
  }
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export const PORTAL_TTL = 60 * 60 * 24 * 30; // 30 days
