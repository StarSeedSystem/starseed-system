#!/usr/bin/env node
/**
 * StarSeed XR · Medidor de paquete (XR1010AL · contrato §3 l, §0.6).
 * Lee .next/build-manifest.json y app-build-manifest.json tras una build y
 * reporta kB de JS inicial para /xr/os y una ruta (app) de referencia.
 * Avisa si el JS del layout raíz sube respecto a la línea base o si aparecen
 * @iwer/devui / three@0.165 en los chunks.
 * NO ejecuta next build.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const NEXT_DIR = path.join(ROOT, ".next");
const MEMORY_ROOT = path.join(ROOT, "starseed_memory_root", "xr");
const BASELINE_FILE = path.join(MEMORY_ROOT, "paquete-base.json");

const RUTA_XR = "/xr/os";
const RUTA_APP = "/escritorios"; // ruta representativa del grupo (app)

function leerJSON(archivo) {
  if (!existsSync(archivo)) return null;
  return JSON.parse(readFileSync(archivo, "utf8"));
}

function kbytes(bytes) {
  return Math.round(bytes / 1024);
}

function main() {
  const buildManifest = leerJSON(path.join(NEXT_DIR, "build-manifest.json"));
  const appBuildManifest = leerJSON(path.join(NEXT_DIR, "app-build-manifest.json"));

  if (!buildManifest || !appBuildManifest) {
    console.error("❌ No hay build (.next/build-manifest.json o .next/app-build-manifest.json no existen).");
    console.error("   Ejecuta `next build` primero y luego vuelve a correr este script.");
    process.exit(1);
  }

  // Cargar o crear línea base
  let baseline = {};
  if (existsSync(BASELINE_FILE)) {
    baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  } else {
    mkdirSync(MEMORY_ROOT, { recursive: true });
  }

  // Páginas de entrada desde app-build-manifest
  const entrypoints = appBuildManifest.entrypoints || {};
  const xrChunks = entrypoints[RUTA_XR] || [];
  const appChunks = entrypoints[RUTA_APP] || [];

  // Mapear chunk -> tamaño en bytes desde build-manifest
  const chunkSizes = {};
  for (const [chunk, info] of Object.entries(buildManifest)) {
    if (typeof info === "object" && info !== null && "size" in info) {
      chunkSizes[chunk] = info.size;
    }
  }

  function calcularKB(chunks) {
    let total = 0;
    for (const chunk of chunks) {
      if (chunk.endsWith(".js") && chunkSizes[chunk]) {
        total += chunkSizes[chunk];
      }
    }
    return kbytes(total);
  }

  const xrKB = calcularKB(xrChunks);
  const appKB = calcularKB(appChunks);

  // Layout raíz: chunks que NO son de página específica (compartidos)
  const todosChunksPagina = new Set();
  for (const chunks of Object.values(entrypoints)) {
    for (const c of chunks) todosChunksPagina.add(c);
  }
  const layoutChunks = Object.keys(chunkSizes).filter(
    (c) => c.endsWith(".js") && !todosChunksPagina.has(c) && !c.includes("page") && !c.includes("app/")
  );
  const layoutKB = calcularKB(layoutChunks);

  console.log("\n📦  Medición de paquete XR1010AL");
  console.log("────────────────────────────────────");
  console.log(`Ruta XR (${RUTA_XR}):     ${xrKB} kB JS inicial`);
  console.log(`Ruta App (${RUTA_APP}):     ${appKB} kB JS inicial`);
  console.log(`Layout raíz (compartido): ${layoutKB} kB JS inicial`);

  // Comprobar línea base del layout raíz
  const baselineKey = "layoutRootKB";
  let avisoBaseline = false;
  if (baseline[baselineKey] !== undefined) {
    const diff = layoutKB - baseline[baselineKey];
    if (diff > 0) {
      console.log(`\n⚠️  AVISO: Layout raíz subió ${diff} kB respecto a la línea base (${baseline[baselineKey]} kB → ${layoutKB} kB).`);
      avisoBaseline = true;
    } else if (diff < 0) {
      console.log(`\n✅ Layout raíz bajó ${Math.abs(diff)} kB respecto a la línea base.`);
    } else {
      console.log(`\n✅ Layout raíz estable (${layoutKB} kB).`);
    }
  } else {
    console.log(`\n📝 Primera medición: guardando línea base del layout raíz (${layoutKB} kB).`);
  }

  // Actualizar línea base si no existe o si bajó (nueva mejor marca)
  if (baseline[baselineKey] === undefined || layoutKB < baseline[baselineKey]) {
    baseline[baselineKey] = layoutKB;
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
    console.log(`   Línea base actualizada en ${BASELINE_FILE}`);
  }

  // Buscar @iwer/devui y three@0.165 en chunks
  const chunksConIwer = [];
  const chunksConThree165 = [];

  for (const chunk of Object.keys(chunkSizes)) {
    if (!chunk.endsWith(".js")) continue;
    const chunkPath = path.join(NEXT_DIR, chunk);
    if (!existsSync(chunkPath)) continue;
    const contenido = readFileSync(chunkPath, "utf8");
    if (contenido.includes("@iwer/devui")) chunksConIwer.push(chunk);
    if (contenido.includes("three@0.165") || contenido.includes("three@0.165.")) chunksConThree165.push(chunk);
  }

  if (chunksConIwer.length > 0) {
    console.log(`\n🚨 CRÍTICO: @iwer/devui aparece en ${chunksConIwer.length} chunk(s):`);
    for (const c of chunksConIwer) console.log(`   - ${c}`);
  } else {
    console.log(`\n✅ @iwer/devui NO encontrado en chunks de producción.`);
  }

  if (chunksConThree165.length > 0) {
    console.log(`\n🚨 CRÍTICO: three@0.165 detectado en ${chunksConThree165.length} chunk(s):`);
    for (const c of chunksConThree165) console.log(`   - ${c}`);
  } else {
    console.log(`\n✅ three@0.165 NO detectado en chunks de producción.`);
  }

  console.log("\n────────────────────────────────────");

  // Código de salida: 1 si hay avisos críticos
  const critico = chunksConIwer.length > 0 || chunksConThree165.length > 0;
  if (critico) process.exit(1);
}

main();