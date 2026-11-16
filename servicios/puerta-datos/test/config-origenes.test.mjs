// Orígenes de las apps nativas de prueba: lista cerrada 47610–47619, ni un puerto más.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ORIGENES_POR_DEFECTO, leerConfig } from "../src/config.mjs";
import { crearServidor } from "../src/servidor.mjs";

const NUEVOS = Array.from({ length: 10 }, (_, i) => `http://127.0.0.1:${47610 + i}`);
const ANTERIORES = [
  "https://starseed-os.vercel.app",
  "http://localhost:9002",
  "http://127.0.0.1:9002",
  "http://localhost:3000",
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "capacitor://localhost",
];

test("los diez puertos nuevos están, los de antes siguen y nada se ensancha", () => {
  const origenes = new Set(ORIGENES_POR_DEFECTO);
  for (const o of NUEVOS) assert.ok(origenes.has(o), `falta ${o}`);
  for (const o of ANTERIORES) assert.ok(origenes.has(o), `falta el de antes ${o}`);
  for (const o of [
    "http://127.0.0.1:47609",
    "http://127.0.0.1:47620",
    "http://localhost:47610",
    "https://127.0.0.1:47610",
    "http://127.0.0.1:47610.evil.com",
    "http://evil.com",
  ]) {
    assert.ok(!origenes.has(o), `no debería estar ${o}`);
  }
  assert.equal(ORIGENES_POR_DEFECTO.length, ANTERIORES.length + NUEVOS.length);
});

test("leerConfig entrega los diez sin que haga falta configurar el entorno", () => {
  const origenes = new Set(leerConfig({}).origenes);
  for (const o of [...NUEVOS, ...ANTERIORES]) assert.ok(origenes.has(o), `falta ${o}`);
});

let servidor;
let base;

before(async () => {
  servidor = crearServidor({ config: { ...leerConfig({}), puerto: 0 }, registrar: () => {} });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

test("el servidor da CORS a cada origen nuevo y lo niega a uno no listado", async () => {
  for (const origen of NUEVOS) {
    const r = await fetch(`${base}/v1/neuronas`, { method: "OPTIONS", headers: { origin: origen } });
    assert.equal(r.status, 204, origen);
    assert.equal(r.headers.get("access-control-allow-origin"), origen, origen);
  }
  const malo = await fetch(`${base}/v1/neuronas`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:47620" } });
  assert.equal(malo.status, 403);
  assert.equal(malo.headers.get("access-control-allow-origin"), null);
});
