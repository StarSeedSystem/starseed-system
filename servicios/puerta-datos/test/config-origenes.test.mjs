// Orígenes por defecto de la puerta: los de siempre más la app nativa de prueba
// (127.0.0.1:47610-47619), que es lo que hace responder a «Emparejar este aparato».
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

const NO_ADMITIDOS = [
  "http://127.0.0.1:47609",
  "http://127.0.0.1:47620",
  "http://localhost:47610",
  "https://127.0.0.1:47610",
  "http://127.0.0.1:47610.evil.com",
  "http://evil.com",
];

let servidor;
let base;

before(async () => {
  servidor = crearServidor({ config: leerConfig({}) });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => servidor?.close());

test("los diez orígenes de la app nativa están y los de antes siguen", () => {
  assert.ok(Object.isFrozen(ORIGENES_POR_DEFECTO));
  assert.equal(ORIGENES_POR_DEFECTO.length, 18);
  for (const origen of NUEVOS) assert.ok(ORIGENES_POR_DEFECTO.includes(origen), origen);
  for (const origen of ANTERIORES) assert.ok(ORIGENES_POR_DEFECTO.includes(origen), origen);
  assert.deepEqual(leerConfig({}).origenes.slice(-10), NUEVOS);
});

test("nada más ancho: ni puertos vecinos, ni localhost, ni https, ni dominios falsos", () => {
  for (const origen of NO_ADMITIDOS) {
    assert.ok(!ORIGENES_POR_DEFECTO.includes(origen), origen);
    assert.ok(!leerConfig({}).origenes.includes(origen), origen);
  }
});

test("CORS: cada origen nuevo recibe su cabecera y uno no listado no", async () => {
  for (const origen of NUEVOS) {
    const r = await fetch(`${base}/salud`, { method: "OPTIONS", headers: { origin: origen } });
    assert.equal(r.status, 204, origen);
    assert.equal(r.headers.get("access-control-allow-origin"), origen);
  }
  const malo = await fetch(`${base}/salud`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:47620" } });
  assert.equal(malo.status, 403);
  assert.equal(malo.headers.get("access-control-allow-origin"), null);
});
