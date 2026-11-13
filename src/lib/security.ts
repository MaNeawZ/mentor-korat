import {
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
export function verifyLineSignature(
  raw: string,
  signature: string,
  secret: string,
) {
  const expected = createHmac("sha256", secret).update(raw).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function deriveToken(nonce: string, secret: string) {
  if (secret.length < 32)
    throw new Error("UPLOAD_TOKEN_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(nonce).digest("base64url");
}
export function newToken(secret: string) {
  const nonce = randomBytes(32).toString("hex");
  const token = deriveToken(nonce, secret);
  return { nonce, token, hash: hashToken(token) };
}
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export function imageType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if (
    Buffer.from(bytes.slice(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  )
    return "image/png";
  if (
    Buffer.from(bytes.slice(0, 4)).toString() === "RIFF" &&
    Buffer.from(bytes.slice(8, 12)).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
