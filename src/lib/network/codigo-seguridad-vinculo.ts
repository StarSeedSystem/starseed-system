"use client";

/*
 * codigo-seguridad-vinculo — CÓDIGO DE SEGURIDAD PARA VERIFICACIÓN FUERA DE BANDA (Ola 370 §7).
 * ---------------------------------------------------------------------------
 * TOFU (Trust On First Use): la primera clave pública que llega se cree.
 * Este módulo permite a los dos usuarios comparar un código corto derivado de
 * AMBAS claves públicas para detectar un ataque man-in-the-middle.
 *
 *   huellaJwk(jwk)       → huella RFC 7638 (base64url sin relleno) de la clave EC.
 *   codigoSeguridad(A,B) → 20 dígitos en 5 grupos de 4, idéntico en los dos aparatos.
 *
 * Módulo PURO: sin `node:*`, sin `window` al importarse, nunca lanza.
 */

function subtle(): SubtleCrypto | null {
  try {
    return globalThis.crypto?.subtle ?? null;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * huellaJwk — huella RFC 7638 de una clave EC (JWK).
 * Serializa SOLO `crv`, `kty`, `x`, `y` (en ese orden, sin espacios),
 * aplica SHA-256 y codifica en base64url sin relleno.
 * Ignora `ext`, `key_ops`, `alg` y cualquier otro campo.
 * Devuelve `null` si no es `kty: "EC"` o falta `crv`, `x` o `y`.
 */
export async function huellaJwk(jwk: JsonWebKey): Promise<string | null> {
  const s = subtle();
  if (!s) return null;
  if (!jwk || typeof jwk !== "object") return null;
  if (jwk.kty !== "EC") return null;
  if (!jwk.crv || !jwk.x || !jwk.y) return null;

  const canon = JSON.stringify({
    crv: jwk.crv,
    kty: "EC",
    x: jwk.x,
    y: jwk.y,
  });

  try {
    const digest = await s.digest("SHA-256", new TextEncoder().encode(canon));
    return bytesToBase64Url(new Uint8Array(digest));
  } catch {
    return null;
  }
}

/**
 * codigoSeguridad — código de 20 dígitos (5 grupos de 4) para verificación fuera de banda.
 * SHA-256 de `starseed-vinculo-v1|<menor>|<mayor>` donde `<menor>` y `<mayor>`
 * son las dos huellas RFC 7638 ORDENADAS lexicográficamente (así el código
 * sale igual en los dos aparatos).
 * El grupo i (0-4) son los bytes 5i..5i+4 del resumen leídos como entero
 * (big-endian), módulo 10000, con ceros a la izquierda (formato `^\\d{4}( \\d{4}){4}$`).
 * Devuelve `null` si falta una huella.
 */
export async function codigoSeguridad(pubA: JsonWebKey, pubB: JsonWebKey): Promise<string | null> {
  const s = subtle();
  if (!s) return null;

  const [h1, h2] = await Promise.all([huellaJwk(pubA), huellaJwk(pubB)]);
  if (!h1 || !h2) return null;

  const [menor, mayor] = h1 < h2 ? [h1, h2] : [h2, h1];
  const input = `starseed-vinculo-v1|${menor}|${mayor}`;

  try {
    const digest = await s.digest("SHA-256", new TextEncoder().encode(input));
    const bytes = new Uint8Array(digest);
    const grupos: string[] = [];
    for (let i = 0; i < 5; i++) {
      // bytes 5i .. 5i+4 (5 bytes = 40 bits) leídos como entero big-endian sin signo
      let val = 0;
      for (let j = 0; j < 5; j++) {
        val = (val << 8) | bytes[5 * i + j];
      }
      grupos.push((val % 10000).toString().padStart(4, "0"));
    }
    return grupos.join(" ");
  } catch {
    return null;
  }
}