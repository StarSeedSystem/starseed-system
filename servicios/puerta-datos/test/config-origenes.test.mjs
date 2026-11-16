// La puerta acepta el origen de la app nativa de prueba (127.0.0.1:47610–47619) y nada más ancho.
// Causa: «Emparejar este aparato» decía «la puerta de datos del A1 no responde» porque ese origen
// no estaba en ORIGENES_POR_DEFECTO (servicios/puerta-datos/src/config.mjs).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ORIGENES_POR_DEFECTO, leerConfig } from "../src/config.mjs";
import { crearServidor } from "../src/servidor.mjs";

const NUEVOS = Array.from({ length: 10 }, (_, i) => `http://127.0.0.1:${47610 + i}`);
const ANTIGUOS = [
  "https://starseed-os.vercel.app",
  "http://localhost:9002",
  "http://127.0.0.1:9002",
  "http://localhost:3000",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "capacitor://localhost",
];

let servidor;
let base;

before(async () => {
  servidor = crearServidor({
    config: { ...leerConfig({}), origenes: ORIGENES_POR_DEFECTO },
    replica: { estado: () => ({ activa: false, pendientes: 0, hoy: 0, sin_migracion: 0 }) },
    verificador: { estado: () => ({ ok: true }) },
    estadoCaddy: () => ({ ok: true }),
    registrar: () => {},
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

test("los diez orígenes de la app nativa de prueba están, sin comodines y en lista cerrada", () => {
  assert.equal(ORIGENES_POR_DEFECTO.length, ANTIGUOS.length + NUEVOS.length);
  for (const o of NUEVOS) assert.ok(ORIGENES_POR_DEFECTO.includes(o), `${o} falta`);
  assert.ok(Object.isFrozen(ORIGENES_POR_DEFECTO));
  assert.ok(ORIGENES_POR_DEFECTO.every((o) => !o.includes("*")), "sin comodines");
});

test("nada más ancho: ni vecinos de puerto, ni localhost, ni https, ni subdominios", () => {
  const fuera = [
    "http://127.0.0.1:47609",
    "http://127.0.0.1:47620",
    "http://localhost:47610",
    "https://127.0.0.1:47610",
    "http://127.0.0.1:47610.evil.com",
    "http://evil.com",
  ];
  for (const o of fuera) assert.ok(!ORIGENES_POR_DEFECTO.includes(o), `${o} no debe estar`);
});

test("los orígenes por defecto de antes siguen", () => {
  for (const o of ANTIGUOS) assert.ok(ORIGENES_POR_DEFECTO.includes(o), `${o} desapareció`);
});

test("cada origen nuevo recibe la cabecera CORS del servidor", async () => {
  for (const origen of NUEVOS) {
    const pre = await fetch(`${base}/salud`, { method: "OPTIONS", headers: { origin: origen } });
    assert.equal(pre.status, 204, `${origen} en OPTIONS`);
    assert.equal(pre.headers.get("access-control-allow-origin"), origen, `${origen} en OPTIONS`);
    await pre.text();
    const r = await fetch(`${base}/salud`, { headers: { origin: origen } });
    assert.equal(r.status, 200, `${origen} en GET`);
    assert.equal(r.headers.get("access-control-allow-origin"), origen, `${origen} en GET`);
    await r.text();
  }
});

test("un origen no listado no recibe CORS y responde 403", async () => {
  for (const origen of ["http://127.0.0.1:47609", "http://127.0.0.1:47620", "http://localhost:47610", "http://evil.com"]) {
    const r = await fetch(`${base}/salud`, { method: "OPTIONS", headers: { origin: origen } });
    assert.equal(r.status, 403, `${origen}`);
    assert.equal(r.headers.get("access-control-allow-origin"), null, `${origen}`);
    await r.text();
  }
});
