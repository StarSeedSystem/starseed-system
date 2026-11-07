/*
 * Pruebas de solo-mac.mjs (APP1107B · T8): qué se quita del build nativo y que nunca rompa nada.
 *   node --test native/servidor-local/__tests__/
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RUTAS_SOLO_MAC, importadores, quitarSoloMac, resolverEspecificador } from "../solo-mac.mjs";

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function repoDeMentira(archivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "ss-solo-mac-"));
  for (const [rel, texto] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
    fs.writeFileSync(path.join(raiz, rel), texto);
  }
  return raiz;
}

const BASE = {
  "src/app/api/mando/grafo/route.ts": 'import { construirGrafo } from "@/lib/mando/grafo";\nexport async function GET() {}\n',
  "src/app/api/mando/grafo/__tests__/route.test.ts": 'import { GET } from "../route";\n',
  "src/app/(app)/metagenesis/page.tsx": 'import { CentroMando } from "@/components/mando/centro-mando";\n',
  "src/lib/mando/grafo.ts": "export const construirGrafo = () => 1;\n",
};

test("solo /api/mando sale del build nativo", () => {
  assert.deepEqual(RUTAS_SOLO_MAC, ["src/app/api/mando"]);
});

test("resuelve los imports del proyecto y deja los paquetes", () => {
  assert.equal(resolverEspecificador("@/app/api/mando/x", "/r/src/a.ts", "/r"), path.join("/r", "src", "app/api/mando/x"));
  assert.equal(resolverEspecificador("../api/mando/x", "/r/src/app/b/c.ts", "/r"), path.resolve("/r/src/app/b", "../api/mando/x"));
  assert.equal(resolverEspecificador("next/server", "/r/src/a.ts", "/r"), null);
});

test("quita /api/mando cuando nadie de fuera lo importa (y no toca lo demás)", () => {
  const raiz = repoDeMentira(BASE);
  try {
    const simulado = quitarSoloMac({ raiz, simular: true });
    assert.equal(simulado.quitado, false);
    assert.equal(simulado.carpetas[0].archivos, 2);
    assert.ok(fs.existsSync(path.join(raiz, "src/app/api/mando")));
    const r = quitarSoloMac({ raiz });
    assert.equal(r.quitado, true);
    assert.deepEqual(r.importadores, []);
    assert.ok(!fs.existsSync(path.join(raiz, "src/app/api/mando")));
    assert.ok(fs.existsSync(path.join(raiz, "src/app/(app)/metagenesis/page.tsx")), "las páginas de Genesis se quedan");
    assert.ok(fs.existsSync(path.join(raiz, "src/lib/mando/grafo.ts")), "las librerías se quedan (el trazador decide)");
    // Otra vez: no hay nada que quitar, y no falla.
    assert.deepEqual(quitarSoloMac({ raiz }).carpetas, []);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test("si algo de fuera lo importa, no borra nada y lo dice", () => {
  for (const uso of [
    'import { GET } from "@/app/api/mando/grafo/route";',
    'const m = await import("../../app/api/mando/grafo/route");',
    'export * from "@/app/api/mando/grafo/route";',
  ]) {
    const raiz = repoDeMentira({ ...BASE, "src/lib/otro/usa.ts": uso + "\n" });
    try {
      const r = quitarSoloMac({ raiz });
      assert.equal(r.quitado, false, uso);
      assert.equal(r.importadores.length, 1, uso);
      assert.equal(r.importadores[0].archivo, path.join("src", "lib", "otro", "usa.ts"));
      assert.ok(fs.existsSync(path.join(raiz, "src/app/api/mando/grafo/route.ts")));
    } finally {
      fs.rmSync(raiz, { recursive: true, force: true });
    }
  }
});

test("en el repo de verdad nadie de fuera importa /api/mando", { skip: !fs.existsSync(path.join(RAIZ_REPO, "src/app")) }, () => {
  assert.deepEqual(importadores(RAIZ_REPO), []);
});
