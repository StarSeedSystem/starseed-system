/**
 * codigo-seguridad-vinculo — tests (Ola 370 §7).
 * JWK de prueba escritos a mano (claves EC P-256 válidas, solo crv/kty/x/y).
 */
import { describe, expect, test } from "vitest";
import { codigoSeguridad, huellaJwk } from "@/lib/network/codigo-seguridad-vinculo";

// JWK EC P-256 de prueba (clave A) — SOLO campos canónicos RFC 7638
const JWK_A: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
  y: "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
};

// JWK EC P-256 de prueba (clave B) — distinta de A
const JWK_B: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "weNJy2HscCSM6AEDTDg04biOvhFhyyWvOHQfeF_PxMQ",
  y: "e8lnCO-AlStT-NJVn_cnh1TX6cNEd3YrqF2eT5W24lY",
};

// JWK con campos extra (deben ignorarse)
const JWK_A_CON_EXTRAS: JsonWebKey = {
  ...JWK_A,
  ext: true,
  key_ops: ["deriveBits"],
  alg: "ECDH-ES",
};

// JWK con kty distinto (no EC)
const JWK_RSA: JsonWebKey = {
  kty: "RSA",
  n: "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYB9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw",
  e: "AQAB",
};

// JWK EC sin x
const JWK_SIN_X: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  y: "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
};

describe("huellaJwk", () => {
  test("devuelve huella RFC 7638 base64url para JWK EC válida", async () => {
    const h = await huellaJwk(JWK_A);
    expect(h).toBeTruthy();
    expect(typeof h).toBe("string");
    // base64url sin relleno: 43 chars (256 bits = 32 bytes → 43 chars base64url)
    expect(h).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  test("ignora campos extra (ext, key_ops, alg)", async () => {
    const h1 = await huellaJwk(JWK_A);
    const h2 = await huellaJwk(JWK_A_CON_EXTRAS);
    expect(h1).toBe(h2);
  });

  test("devuelve null si kty no es EC", async () => {
    const h = await huellaJwk(JWK_RSA);
    expect(h).toBeNull();
  });

  test("devuelve null si falta crv", async () => {
    const jwk = { ...JWK_A, crv: undefined };
    const h = await huellaJwk(jwk);
    expect(h).toBeNull();
  });

  test("devuelve null si falta x", async () => {
    const h = await huellaJwk(JWK_SIN_X);
    expect(h).toBeNull();
  });

  test("devuelve null si falta y", async () => {
    const jwk = { ...JWK_A, y: undefined };
    const h = await huellaJwk(jwk);
    expect(h).toBeNull();
  });

  test("devuelve null para entrada nula/inválida", async () => {
    await expect(huellaJwk(null as unknown as JsonWebKey)).resolves.toBeNull();
    await expect(huellaJwk({} as JsonWebKey)).resolves.toBeNull();
  });
});

describe("codigoSeguridad", () => {
  test("mismo código en los dos órdenes (A,B y B,A)", async () => {
    const c1 = await codigoSeguridad(JWK_A, JWK_B);
    const c2 = await codigoSeguridad(JWK_B, JWK_A);
    expect(c1).toBeTruthy();
    expect(c1).toBe(c2);
  });

  test("cambia si cambia x de una clave", async () => {
    const JWK_A_MOD: JsonWebKey = { ...JWK_A, x: "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D5" };
    const c1 = await codigoSeguridad(JWK_A, JWK_B);
    const c2 = await codigoSeguridad(JWK_A_MOD, JWK_B);
    expect(c1).not.toBe(c2);
  });

  test("campos extra no cambian el código", async () => {
    const c1 = await codigoSeguridad(JWK_A, JWK_B);
    const c2 = await codigoSeguridad(JWK_A_CON_EXTRAS, JWK_B);
    expect(c1).toBe(c2);
  });

  test("devuelve null si falta una clave", async () => {
    await expect(codigoSeguridad(null as unknown as JsonWebKey, JWK_B)).resolves.toBeNull();
    await expect(codigoSeguridad(JWK_A, null as unknown as JsonWebKey)).resolves.toBeNull();
  });

  test("devuelve null si kty no es EC en una clave", async () => {
    const c = await codigoSeguridad(JWK_RSA, JWK_B);
    expect(c).toBeNull();
  });

  test("formato: 5 grupos de 4 dígitos separados por espacio", async () => {
    const c = await codigoSeguridad(JWK_A, JWK_B);
    expect(c).toMatch(/^\d{4}( \d{4}){4}$/);
  });

  test("determinista: misma entrada → mismo código", async () => {
    const c1 = await codigoSeguridad(JWK_A, JWK_B);
    const c2 = await codigoSeguridad(JWK_A, JWK_B);
    expect(c1).toBe(c2);
  });
});