const encoder = new TextEncoder();

export const SESSION_COOKIE_NAME = "preopp_session";
export const SESSION_DURATION_SECONDS = 8 * 60 * 60;

export type SessionPayload = {
  version: 1;
  expiresAt: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signValue(value: string, secret: string): Promise<Uint8Array> {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));

  return new Uint8Array(signature);
}

async function verifySignature(
  value: string,
  signature: Uint8Array,
  secret: string
): Promise<boolean> {
  try {
    const key = await importHmacKey(secret);

    return crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(value)
    );
  } catch {
    return false;
  }
}

export function getAuthConfiguration() {
  const password = process.env.DASHBOARD_PASSWORD || "";
  const authSecret = process.env.AUTH_SECRET || "";
  const isValid = password.length >= 12 && authSecret.length >= 32;

  return {
    password,
    authSecret,
    isValid,
    signingSecret: isValid ? `${authSecret}\u0000${password}` : "",
  };
}

export async function createSessionToken(signingSecret: string): Promise<string> {
  const payload: SessionPayload = {
    version: 1,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS,
  };

  const encodedPayload = bytesToBase64Url(
    encoder.encode(JSON.stringify(payload))
  );
  const signature = await signValue(encodedPayload, signingSecret);

  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  signingSecret: string
): Promise<boolean> {
  if (!token || !signingSecret) return false;

  const [encodedPayload, encodedSignature, extraPart] = token.split(".");

  if (!encodedPayload || !encodedSignature || extraPart) return false;

  try {
    const signature = base64UrlToBytes(encodedSignature);
    const validSignature = await verifySignature(
      encodedPayload,
      signature,
      signingSecret
    );

    if (!validSignature) return false;

    const payloadText = new TextDecoder().decode(
      base64UrlToBytes(encodedPayload)
    );
    const payload = JSON.parse(payloadText) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);

    return payload.version === 1 && Number(payload.expiresAt) > now;
  } catch {
    return false;
  }
}

export async function constantTimeTextEqual(
  firstValue: string,
  secondValue: string
): Promise<boolean> {
  const [firstDigest, secondDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(firstValue)),
    crypto.subtle.digest("SHA-256", encoder.encode(secondValue)),
  ]);

  const firstBytes = new Uint8Array(firstDigest);
  const secondBytes = new Uint8Array(secondDigest);
  let difference = 0;

  for (let index = 0; index < firstBytes.length; index += 1) {
    difference |= firstBytes[index] ^ secondBytes[index];
  }

  return difference === 0;
}

export function sanitizeReturnPath(value: unknown): string {
  if (typeof value !== "string") return "/";

  const trimmed = value.trim();

  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/login") ||
    trimmed.startsWith("/api/")
  ) {
    return "/";
  }

  return trimmed;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
