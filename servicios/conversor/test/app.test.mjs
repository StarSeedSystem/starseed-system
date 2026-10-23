import assert from "node:assert/strict";
import { test } from "node:test";

import { crearApp, formatoDe, esFormatoValido, etiquetaFormato, nombreDeSalida, VERSION, MAX_BYTES, MAX_SIMULTANEAS } from "../src/app.mjs";

test("funciones puras de formato", () => {
  assert.strictEqual(formatoDe("nota.md"), "md");
  assert.strictEqual(formatoDe("image/png"), "png");
  assert.strictEqual(formatoDe(".jpg"), "jpg");
  assert.strictEqual(esFormatoValido("md"), true);
  assert.strictEqual(esFormatoValido(""), false);
  assert.strictEqual(etiquetaFormato("md"), "Markdown");
  assert.strictEqual(nombreDeSalida("informe", "pdf"), "informe.pdf");
});

test("constantes del servicio", () => {
  assert.strictEqual(VERSION, "1.0.0");
  assert.strictEqual(MAX_BYTES, 500 * 1024 * 1024);
  assert.strictEqual(MAX_SIMULTANEAS, 2);
});

test("salud del servicio sin token", async () => {
  const app = crearApp({ token: "" });
  const r = await app.request("/salud");
  assert.strictEqual(r.status, 200);
  const j = await r.json();
  assert.strictEqual(j.ok, true);
  assert.strictEqual(j.servicio, "conversor");
  assert.strictEqual(j.con_token, false);
});

test("convertir con archivo vacío rechaza", async () => {
  const app = crearApp({ token: "" });
  const fd = new FormData();
  fd.append("archivo", new Blob([new Uint8Array(0)]), "vacio");
  fd.append("a", "pdf");
  fd.append("calidad", "80");
  const r = await app.request("/convertir", { method: "POST", body: fd });
  assert.strictEqual(r.status, 400);
});

test("salud con token; rutas protegidas requieren Bearer", async () => {
  const app = crearApp({ token: "t0k" });
  const r = await app.request("/salud");
  assert.strictEqual(r.status, 200);
  const r2 = await app.request("/formatos?de=md");
  assert.strictEqual(r2.status, 401);
  const r3 = await app.request("/formatos?de=md", { headers: { Authorization: "Bearer t0k" } });
  assert.strictEqual(r3.status, 200);
});
