import { test } from "node:test";
import assert from "node:assert/strict";
import { crearVerificador } from "../src/jwt.mjs";
import { clavesEc, CUENTA, fetchFalso, firmar, PROYECTO, sesion } from "./ayudas.mjs";

function montar(claves, extra = {}) {
  const f = fetchFalso({ "GET /auth/v1/.well-known/jwks.json": () => [200, { keys: [claves.jwk] }], ...extra });
  return { f, v: crearVerificador({ supabaseUrl: PROYECTO, fetch: f }) };
}

test("una sesión ES256 bien firmada pasa sin llamar a /auth/v1/user", async () => {
  const k = clavesEc();
  const { f, v } = montar(k);
  const r = await v.verificar(sesion(k));
  assert.equal(r.ok, true);
  assert.equal(r.cuenta, CUENTA);
  assert.ok(f.llamadas.every((l) => !l.url.includes("/auth/v1/user")));
  // La JWKS se pide UNA vez para muchas verificaciones.
  for (let i = 0; i < 20; i++) assert.equal((await v.verificar(sesion(k))).ok, true);
  assert.equal(f.llamadas.length, 1);
});

test("rechaza firma ajena, caducada, de otro emisor, otro rol y alg none/HS256", async () => {
  const k = clavesEc();
  const intruso = clavesEc("kid-prueba"); // mismo kid, otra clave
  const { v } = montar(k);
  assert.equal((await v.verificar(sesion(intruso))).motivo, "firma no válida");
  assert.equal((await v.verificar(sesion(k, { exp: Math.floor(Date.now() / 1000) - 120 }))).motivo, "sesión caducada");
  assert.equal((await v.verificar(sesion(k, { iss: "https://otro.supabase.co/auth/v1" }))).motivo, "emisor ajeno");
  assert.equal((await v.verificar(sesion(k, { role: "service_role" }))).motivo, "rol no admitido");
  assert.equal((await v.verificar(sesion(k, { aud: "otra" }))).motivo, "audiencia ajena");
  assert.equal((await v.verificar(sesion(k, { sub: "no-es-uuid" }))).motivo, "cuenta no válida");
  const sinFirma = firmar(k, { sub: CUENTA }, { alg: "none" });
  assert.equal((await v.verificar(sinFirma)).motivo, "algoritmo no admitido");
  const hs = firmar(k, { sub: CUENTA }, { alg: "HS256" });
  assert.equal((await v.verificar(hs)).motivo, "algoritmo no admitido");
  assert.equal((await v.verificar("basura")).ok, false);
  // Firma manipulada: se cambia el cuerpo y se conserva la firma.
  const buena = sesion(k);
  const [h, , s] = buena.split(".");
  const otro = Buffer.from(JSON.stringify({ iss: `${PROYECTO}/auth/v1`, aud: "authenticated", role: "authenticated", sub: "00000000-0000-4000-8000-000000000001", exp: 9e9 })).toString("base64url");
  assert.equal((await v.verificar(`${h}.${otro}.${s}`)).motivo, "firma no válida");
});

test("sin JWKS responde 503 (el cliente vuelve a Supabase) y no concede nada", async () => {
  const k = clavesEc();
  const f = fetchFalso({ "GET /auth/v1/.well-known/jwks.json": () => [500, { message: "caído" }] });
  const v = crearVerificador({ supabaseUrl: PROYECTO, fetch: f });
  const r = await v.verificar(sesion(k));
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 503);
  assert.equal(v.estado().ok, false);
});

test("un kid nuevo (rotación) responde 503 (el cliente usa Supabase) y relee la JWKS como mucho cada 5 min", async () => {
  const viejo = clavesEc("viejo");
  const nuevo = clavesEc("nuevo");
  let claves = [viejo.jwk];
  let t = Date.now();
  const f = fetchFalso({ "GET /auth/v1/.well-known/jwks.json": () => [200, { keys: claves }] });
  const v = crearVerificador({ supabaseUrl: PROYECTO, fetch: f, ahora: () => t });
  assert.equal((await v.verificar(sesion(viejo))).ok, true);
  claves = [viejo.jwk, nuevo.jwk];
  const r = await v.verificar(sesion(nuevo)); // < 5 min
  assert.deepEqual([r.codigo, r.motivo], [503, "clave de firma desconocida"]);
  t += 5 * 60_000 + 1;
  assert.equal((await v.verificar(sesion(nuevo))).ok, true);
  assert.equal(f.llamadas.length, 2);
});
