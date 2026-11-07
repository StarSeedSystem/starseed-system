/*
 * Pruebas de compactar-manifiestos.mjs (TAM1107A · T13):
 *   node --test native/servidor-local/__tests__/compactar-manifiestos.test.mjs
 * Manifiestos hechos como los escribe Next 15.5 (flight-manifest-plugin: listas `chunks` compartidas en memoria
 * y repetidas por JSON.stringify), leídos como los lee Next (vm.runInNewContext + deepFreeze) y, si el repo
 * tiene `next` instalado, con el `evalManifest` DE VERDAD de Next.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compactarTexto, compactarDirectorio, evaluar, SUFIJO } from "../compactar-manifiestos.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..", "..", "..");

/** Como `flight-manifest-plugin.js`: misma lista `chunks` por grupo y alias ESM que comparten objeto. */
function manifiestoComoNext({ modulos = 120, chunks = 60, pagina = "/(app)/escritorios/page" } = {}) {
  const lista = [];
  for (let i = 0; i < chunks; i++) lista.push(String(9000 + i), `static/chunks/${9000 + i}-0123456789abcdef.js`);
  const otra = lista.slice(0, 10);
  const m = { moduleLoading: { prefix: "/_next/", crossOrigin: null }, ssrModuleMapping: {}, edgeSSRModuleMapping: {}, clientModules: {}, entryCSSFiles: {}, rscModuleMapping: {}, edgeRscModuleMapping: {} };
  for (let i = 0; i < modulos; i++) {
    const id = String(1000 + i * 7);
    m.ssrModuleMapping[id] = { "*": { id: String(400000 + i), name: "*", chunks: [], async: false } };
    m.rscModuleMapping[id] = { "*": { id: String(500000 + i), name: "*", chunks: [], async: false } };
    const recurso = `/home/runner/work/starseed-system/starseed-system/node_modules/framer-motion/dist/es/m${i}.mjs`;
    m.clientModules[recurso] = { id, name: "*", chunks: i % 4 === 0 ? otra : lista, async: i % 9 === 0 };
    if (i % 25 === 0) m.clientModules[recurso.replace("/dist/es/", "/dist/esm/")] = m.clientModules[recurso];
  }
  m.entryCSSFiles["/home/runner/work/starseed-system/starseed-system/src/app/layout"] = [{ inlined: false, path: "static/css/a.css" }];
  m.entryCSSFiles["/home/runner/work/starseed-system/starseed-system/src/app/(app)/escritorios/page"] = [];
  return `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST[${JSON.stringify(pagina)}]=${JSON.stringify(m)}`;
}

/** `deepFreeze` de Next (shared/lib/deep-freeze.js): lo que Next hace con lo cargado. */
function congelar(o) {
  if (Object.isFrozen(o)) return o;
  if (Array.isArray(o)) {
    for (const x of o) if (x && typeof x === "object") congelar(x);
    return Object.freeze(o);
  }
  for (const v of Object.values(o)) if (v && typeof v === "object") congelar(v);
  return Object.freeze(o);
}

test("compacta un manifiesto como los de Next y se lee el MISMO objeto", () => {
  const texto = manifiestoComoNext();
  const c = compactarTexto(texto);
  assert.equal(c.ok, true, c.motivo);
  assert.ok(c.despues * 5 < c.antes, `debía bajar ≥ 5× (${c.antes} → ${c.despues})`);
  const a = evaluar(texto);
  const b = evaluar(c.texto);
  assert.deepEqual(Object.keys(b), ["__RSC_MANIFEST"], "ninguna otra global");
  assert.equal(JSON.stringify(b), JSON.stringify(a), "mismo JSON, mismo orden de claves");
  // Las listas vuelven a estar compartidas (como en memoria al compilar) y deepFreeze no se queja.
  const cm = b.__RSC_MANIFEST["/(app)/escritorios/page"].clientModules;
  const k = (i) => Object.keys(cm).find((x) => x.endsWith(`/dist/es/m${i}.mjs`));
  assert.equal(cm[k(1)].chunks, cm[k(2)].chunks, "m1 y m2 comparten la lista");
  assert.equal(cm[k(0)], cm[k(0).replace("/dist/es/", "/dist/esm/")], "el alias ESM comparte objeto");
  congelar(b);
  assert.ok(Object.isFrozen(cm[k(1)].chunks));
  // Idempotente: compactar lo compactado no gana nada.
  assert.equal(compactarTexto(c.texto).ok, false);
});

test("con el evalManifest DE VERDAD de Next (si el repo tiene next instalado)", (t) => {
  let ruta;
  try {
    ruta = createRequire(path.join(RAIZ, "package.json")).resolve("next/dist/server/load-manifest.external.js");
  } catch {
    t.skip("next no está instalado aquí");
    return;
  }
  const { evalManifest } = createRequire(import.meta.url)(ruta);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-compactar-next-"));
  try {
    const texto = manifiestoComoNext({ pagina: "/page" });
    const original = path.join(dir, "original" + SUFIJO);
    const compacto = path.join(dir, "compacto" + SUFIJO);
    fs.writeFileSync(original, texto);
    fs.writeFileSync(compacto, compactarTexto(texto).texto);
    const a = evalManifest(original, true, new Map());
    const b = evalManifest(compacto, true, new Map());
    assert.ok(Object.isFrozen(b.__RSC_MANIFEST["/page"].clientModules), "Next lo congela entero");
    assert.equal(JSON.stringify(b), JSON.stringify(a));
    assert.deepEqual(Object.keys(b), ["__RSC_MANIFEST"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("valores raros: claves numéricas, unicode, U+2028, vacíos, null, números", () => {
  const raro = { "10": [1, 2], "2": [1, 2], "ñandú €": [" ", " ", " "], vacio: [], obj: {}, n: null, f: 1.5e-7, b: true, rep: { x: [[], [], {}] }, rep2: { x: [[], [], {}] } };
  const texto = `globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/raro/page"]=${JSON.stringify({ a: raro, b: raro, c: [raro, raro] })}`;
  const c = compactarTexto(texto, { minimo: 1 });
  assert.equal(c.ok, true, c.motivo);
  assert.equal(JSON.stringify(evaluar(c.texto)), JSON.stringify(evaluar(texto)));
});

test("no toca lo que no es un manifiesto de Next (o no gana nada)", () => {
  const motivo = (t) => compactarTexto(t).motivo;
  assert.match(motivo('globalThis.x=1;globalThis.__RSC_MANIFEST={"/p":{"a":[1,2,3]}}'), /no es un manifiesto/);
  assert.match(motivo("globalThis.__RSC_MANIFEST=(("), /no se evalúa/);
  assert.match(motivo('globalThis.__RSC_MANIFEST={"/p":{"__proto__":{"a":1}}}'), /__proto__/);
  assert.match(motivo("globalThis.__RSC_MANIFEST=[1]"), /no es un manifiesto/);
  assert.equal(motivo('globalThis.__RSC_MANIFEST=(globalThis.__RSC_MANIFEST||{});globalThis.__RSC_MANIFEST["/p"]={"a":1}'), "no gana nada");
});

function escribir(raiz, rel, contenido) {
  const p = path.join(raiz, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, contenido);
}

test("directorio: solo los manifiestos, uno a uno, sin tocar lo demás; simular no escribe", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-compactar-dir-"));
  try {
    const paginas = ["app/page", "app/(app)/escritorios/page", "app/post/[id]/page", "app/api/os/versiones/route"];
    for (const p of paginas) escribir(dir, p + SUFIJO, manifiestoComoNext({ pagina: "/" + p.slice(4) }));
    escribir(dir, "app/roto" + SUFIJO, "globalThis.__RSC_MANIFEST=((");
    escribir(dir, "app/page.js", "module.exports = 1;");
    escribir(dir, "chunks/123.js", "/* chunk */");
    const antes = Object.fromEntries([...paginas.map((p) => p + SUFIJO), "app/page.js", "chunks/123.js", "app/roto" + SUFIJO].map((r) => [r, fs.readFileSync(path.join(dir, r), "utf8")]));

    const s = compactarDirectorio(dir, { simular: true });
    assert.equal(s.compactados, 4);
    for (const [r, t] of Object.entries(antes)) assert.equal(fs.readFileSync(path.join(dir, r), "utf8"), t, `simular escribió ${r}`);

    const r = compactarDirectorio(dir);
    assert.equal(r.archivos, 5);
    assert.equal(r.compactados, 4);
    assert.equal(r.sinCambio, 1);
    assert.deepEqual(r.fallos.map((f) => f.archivo), ["app/roto" + SUFIJO]);
    assert.ok(r.bytesDespues * 4 < r.bytesAntes);
    for (const p of paginas) {
      const rel = p + SUFIJO;
      const nuevo = fs.readFileSync(path.join(dir, rel), "utf8");
      assert.notEqual(nuevo, antes[rel]);
      assert.equal(JSON.stringify(evaluar(nuevo)), JSON.stringify(evaluar(antes[rel])), rel);
    }
    for (const rel of ["app/page.js", "chunks/123.js", "app/roto" + SUFIJO]) assert.equal(fs.readFileSync(path.join(dir, rel), "utf8"), antes[rel], `tocó ${rel}`);
    assert.equal(fs.readdirSync(path.join(dir, "app")).filter((n) => n.endsWith(".compactando")).length, 0, "sin restos");

    // Otra pasada: ya no gana nada y no lo cuenta como fallo.
    const otra = compactarDirectorio(dir);
    assert.equal(otra.compactados, 0);
    assert.equal(otra.fallos.length, 1);

    // La línea de órdenes.
    const cli = spawnSync(process.execPath, [path.join(AQUI, "..", "compactar-manifiestos.mjs"), dir, "--simular"], { encoding: "utf8" });
    assert.equal(cli.status, 0);
    assert.match(cli.stdout, /\(simulado\) 0\/5 manifiestos compactados/);
    assert.equal(compactarDirectorio(path.join(dir, "no-existe")).archivos, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("compactar con enlaces duros no cambia el original (rename, no reescritura)", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ss-compactar-enlace-"));
  try {
    const texto = manifiestoComoNext();
    escribir(dir, "original/page" + SUFIJO, texto);
    fs.mkdirSync(path.join(dir, "copia"));
    try {
      fs.linkSync(path.join(dir, "original/page" + SUFIJO), path.join(dir, "copia/page" + SUFIJO));
    } catch {
      t.skip("sin enlaces duros aquí");
      return;
    }
    assert.equal(compactarDirectorio(path.join(dir, "copia")).compactados, 1);
    assert.equal(fs.readFileSync(path.join(dir, "original/page" + SUFIJO), "utf8"), texto);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
