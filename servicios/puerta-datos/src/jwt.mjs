// Verificación LOCAL de las sesiones de Supabase con sus claves públicas (JWKS).
//
// Por qué: cada `/auth/v1/user` es una petición al proyecto. El proyecto del OS firma sus
// sesiones con ES256 (claves asimétricas, comprobado el 2026-10-10 en
// /auth/v1/.well-known/jwks.json), así que la firma se puede comprobar aquí sin preguntar a
// nadie. La JWKS se pide como mucho cada 10 min; un `kid` desconocido (rotación de claves) la
// relee, como mucho una vez por minuto.
//
// Reglas: solo ES256 y RS256 (nunca HS256 ni `none`: en el A1 no hay secreto compartido y no
// debe haberlo), `iss` del proyecto, `aud` = authenticated, `role` = authenticated, `sub` uuid,
// `exp`/`nbf` con 30 s de margen. Contrato: architecture/puerta-datos-a1.md §4.1.

import { createPublicKey, verify as verificarFirma } from "node:crypto";

export const JWKS_VIGENCIA_MS = 10 * 60_000;
// Un `kid` desconocido relee la JWKS como mucho cada 5 min: una sesión inventada no puede
// forzar más de 288 lecturas al día (y mientras tanto la puerta responde 503 → el cliente usa Supabase).
export const KID_NUEVO_MIN_MS = 5 * 60_000;
export const MARGEN_S = 30;
const ALGS = new Set(["ES256", "RS256"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function b64url(texto) {
  return Buffer.from(texto, "base64url");
}

function jsonDe(parte) {
  try {
    const v = JSON.parse(b64url(parte).toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export function pareceJwt(token) {
  return typeof token === "string" && token.length < 8192 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(token);
}

/**
 * @param {{supabaseUrl: string, fetch?: typeof fetch, ahora?: () => number, alPedir?: () => void}} op
 */
export function crearVerificador(op) {
  const base = String(op.supabaseUrl || "").replace(/\/+$/, "");
  const emisor = `${base}/auth/v1`;
  const pedir = op.fetch ?? globalThis.fetch;
  const ahora = op.ahora ?? (() => Date.now());
  /** @type {Map<string, {clave: import("node:crypto").KeyObject, alg: string}>} */
  let claves = new Map();
  let cargadaEn = 0;
  let ultimoIntento = 0;
  let enCurso = null;
  let error = null;

  async function cargar() {
    if (enCurso) return enCurso;
    ultimoIntento = ahora();
    enCurso = (async () => {
      try {
        op.alPedir?.();
        const r = await pedir(`${base}/auth/v1/.well-known/jwks.json`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        });
        if (!r.ok) throw new Error(`JWKS ${r.status}`);
        const cuerpo = await r.json();
        const nuevas = new Map();
        for (const jwk of Array.isArray(cuerpo?.keys) ? cuerpo.keys : []) {
          if (!jwk || typeof jwk.kid !== "string") continue;
          const alg = jwk.alg || (jwk.kty === "EC" ? "ES256" : jwk.kty === "RSA" ? "RS256" : "");
          if (!ALGS.has(alg)) continue;
          try {
            nuevas.set(jwk.kid, { clave: createPublicKey({ key: jwk, format: "jwk" }), alg });
          } catch {
            /* clave que no se puede importar: se ignora */
          }
        }
        if (nuevas.size === 0) throw new Error("JWKS sin claves utilizables");
        claves = nuevas;
        cargadaEn = ahora();
        error = null;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  async function claveDe(kid) {
    const vieja = ahora() - cargadaEn > JWKS_VIGENCIA_MS;
    if ((claves.size === 0 || vieja) && ahora() - ultimoIntento > 5_000) await cargar();
    let c = claves.get(kid);
    if (!c && ahora() - ultimoIntento > KID_NUEVO_MIN_MS) {
      await cargar();
      c = claves.get(kid);
    }
    return c ?? null;
  }

  /**
   * @returns {Promise<{ok: true, claims: Record<string, unknown>, cuenta: string} | {ok: false, codigo: number, motivo: string}>}
   */
  async function verificar(token) {
    if (!base) return { ok: false, codigo: 503, motivo: "sin proyecto configurado" };
    if (!pareceJwt(token)) return { ok: false, codigo: 401, motivo: "sesión con forma no válida" };
    const [h, p, s] = token.split(".");
    const cab = jsonDe(h);
    const claims = jsonDe(p);
    if (!cab || !claims) return { ok: false, codigo: 401, motivo: "sesión ilegible" };
    if (!ALGS.has(cab.alg) || typeof cab.kid !== "string") {
      return { ok: false, codigo: 401, motivo: "algoritmo no admitido" };
    }
    const c = await claveDe(cab.kid);
    if (!c) {
      return claves.size === 0
        ? { ok: false, codigo: 503, motivo: "no se pudieron leer las claves públicas" }
        : { ok: false, codigo: 503, motivo: "clave de firma desconocida" }; // rotación: que lo resuelva Supabase
    }
    if (c.alg !== cab.alg) return { ok: false, codigo: 401, motivo: "algoritmo no coincide con la clave" };
    const datos = Buffer.from(`${h}.${p}`);
    const firma = b64url(s);
    let valida = false;
    try {
      valida = cab.alg === "ES256"
        ? firma.length === 64 && verificarFirma("sha256", datos, { key: c.clave, dsaEncoding: "ieee-p1363" }, firma)
        : verificarFirma("sha256", datos, c.clave, firma);
    } catch {
      valida = false;
    }
    if (!valida) return { ok: false, codigo: 401, motivo: "firma no válida" };
    const t = Math.floor(ahora() / 1000);
    if (claims.iss !== emisor) return { ok: false, codigo: 401, motivo: "emisor ajeno" };
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes("authenticated")) return { ok: false, codigo: 401, motivo: "audiencia ajena" };
    if (claims.role !== "authenticated") return { ok: false, codigo: 401, motivo: "rol no admitido" };
    if (typeof claims.sub !== "string" || !UUID.test(claims.sub)) return { ok: false, codigo: 401, motivo: "cuenta no válida" };
    if (typeof claims.exp !== "number" || claims.exp + MARGEN_S < t) return { ok: false, codigo: 401, motivo: "sesión caducada" };
    if (typeof claims.nbf === "number" && claims.nbf - MARGEN_S > t) return { ok: false, codigo: 401, motivo: "sesión aún no válida" };
    if (typeof claims.iat === "number" && claims.iat - MARGEN_S > t) return { ok: false, codigo: 401, motivo: "sesión del futuro" };
    return { ok: true, claims, cuenta: claims.sub.toLowerCase() };
  }

  return {
    verificar,
    cargar,
    estado() {
      return {
        claves: claves.size,
        cargada: cargadaEn ? new Date(cargadaEn).toISOString() : null,
        ok: claves.size > 0 && ahora() - cargadaEn < 3 * JWKS_VIGENCIA_MS,
        error,
      };
    },
  };
}
