import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const PREFIX = "ssm_";
const RANDOM_BYTES = 32;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/**
 * El token de motor SOLO se enseña una vez al registrar el motor.
 * En la base de datos solo vive el hash, nunca el token en claro.
 */

function toBase64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function formatoTokenValido(token: unknown): token is string {
  if (typeof token !== "string") return false;
  if (!token.startsWith(PREFIX)) return false;
  const body = token.slice(PREFIX.length);
  if (body.length !== 43) return false;
  if (!BASE64URL_RE.test(body)) return false;
  return true;
}

export function crearTokenMotor(): { token: string; hash: string; huella: string } {
  const rand = randomBytes(RANDOM_BYTES);
  const token = PREFIX + toBase64Url(rand);
  const hash = hashToken(token);
  const huella = hash.slice(0, 8);
  return { token, hash, huella };
}

export function verificarToken(token: unknown, hash: unknown): boolean {
  try {
    if (typeof token !== "string" || typeof hash !== "string") return false;
    if (!formatoTokenValido(token)) return false;
    const calculado = hashToken(token);
    if (calculado.length !== hash.length) return false;
    const a = Buffer.from(calculado, "utf8");
    const b = Buffer.from(hash, "utf8");
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const CAPACIDADES_MOTOR = [
  "reportar",
  "recoger-tareas",
  "medidores",
  "chat-motor",
] as const;

export type CapacidadMotor = typeof CAPACIDADES_MOTOR[number];

export function capacidadesMotorValidas(pedidas: unknown): { ok: boolean; invalidas: string[] } {
  if (!Array.isArray(pedidas)) {
    return { ok: false, invalidas: [] };
  }
  const invalidas: string[] = [];
  for (const p of pedidas) {
    if (typeof p !== "string" || !CAPACIDADES_MOTOR.includes(p as CapacidadMotor)) {
      invalidas.push(String(p));
    }
  }
  return { ok: invalidas.length === 0, invalidas };
}
