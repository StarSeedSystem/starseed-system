// Ayudas de las pruebas: claves EC de usar y tirar, sesiones firmadas como las de Supabase y un
// fetch de mentira que responde por ruta y cuenta lo que se le pide.

import { generateKeyPairSync, sign } from "node:crypto";

export const PROYECTO = "https://proyecto-prueba.supabase.co";
export const CUENTA = "00000000-0000-4000-8000-00000000a1e7";
export const OTRA = "00000000-0000-4000-8000-0000000000ee";

export function clavesEc(kid = "kid-prueba") {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
  return { privateKey, jwk, kid };
}

export function firmar(claves, claims, cab = {}) {
  const h = Buffer.from(JSON.stringify({ alg: "ES256", typ: "JWT", kid: claves.kid, ...cab })).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = sign("sha256", Buffer.from(`${h}.${p}`), { key: claves.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${h}.${p}.${s}`;
}

export function sesion(claves, { sub = CUENTA, exp = Math.floor(Date.now() / 1000) + 3600, ...resto } = {}) {
  return firmar(claves, {
    iss: `${PROYECTO}/auth/v1`, aud: "authenticated", role: "authenticated", sub, exp,
    iat: Math.floor(Date.now() / 1000) - 10, ...resto,
  });
}

/** fetch de mentira: `rutas` = { "GET /auth/v1/.well-known/jwks.json": (url, init) => [estado, cuerpo] } */
export function fetchFalso(rutas) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    const u = new URL(String(url));
    const clave = `${(init.method || "GET").toUpperCase()} ${u.pathname}`;
    llamadas.push({ clave, url: String(url), init });
    const fn = rutas[clave];
    if (!fn) return new Response(JSON.stringify({ message: "no existe" }), { status: 404 });
    const [estado, cuerpo] = await fn(u, init);
    return new Response(cuerpo === undefined ? "" : JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json" } });
  };
  f.llamadas = llamadas;
  return f;
}

export function reloj(inicio = Date.parse("2026-10-10T21:00:00Z")) {
  let t = inicio;
  const ahora = () => t;
  ahora.avanzar = (ms) => {
    t += ms;
  };
  return ahora;
}
