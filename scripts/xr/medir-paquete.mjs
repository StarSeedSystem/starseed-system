#!/usr/bin/env node
/**
 * StarSeed XR · mide el paquete JS inicial (XR1010AL, contrato architecture/starseed-xr.md §3 (k)).
 * Lee .next/build-manifest.json y .next/app-build-manifest.json (requiere next build previo).
 * Imprime kB de JS inicial para /xr/os y una ruta (app). Avisa si crece el layout raíz
 * o aparecen @iwer/devui / three@0.165 en los chunks.
 * NO ejecuta next build (con el enjambre vivo no se compila).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const NEXT_DIR = join(ROOT, ".next");
const BASE_FILE = join(ROOT, "starseed_memory_root", "xr", "paquete-base.json");

function kbytes(bytes) {
  return Math.round(bytes / 1024);
}

function readJSON(p) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

function chunkSizes(buildManifest, chunkNames) {
  let total = 0;
  const chunks = buildManifest.pages || {};
  for (const name of chunkNames) {
    const files = chunks[name] || [];
    for (const f of files) {
      if (f.endsWith(".js")) {
        const full = join(NEXT_DIR, f);
        if (existsSync(full)) total += readFileSync(full).length;
      }
    }
  }
  return total;
}

function findRouteInAppGroup(appManifest) {
  const pages = Object.keys(appManifest.pages || {});
  return pages.find(p => p.startsWith("/") && !p.startsWith("/xr/") && !p.startsWith("/api/")) || "/";
}

function main() {
  const buildManifest = readJSON(join(NEXT_DIR, "build-manifest.json"));
  const appManifest = readJSON(join(NEXT_DIR, "app-build-manifest.json"));
  if (!buildManifest || !appManifest) {
    console.warn("⚠️  No hay build .next/ (ejecuta next build antes).");
    process.exit(0);
  }

  // rutas a medir
  const rutaXR = "/xr/os";
  const rutaApp = findRouteInAppGroup(appManifest);

  // chunks iniciales: usamos pages del build-manifest + _app/_document
  const initialChunks = new Set([
    ...(buildManifest.pages["/_app"] || []),
    ...(buildManifest.pages["/_document"] || []),
    ...(buildManifest.pages[rutaXR] || []),
    ...(buildManifest.pages[rutaApp] || []),
  ]);
  const jsChunks = [...initialChunks].filter(c => c.endsWith(".js"));

  // tamaños
  const sizeXR = kbytes(chunkSizes(buildManifest, [rutaXR]));
  const sizeApp = kbytes(chunkSizes(buildManifest, [rutaApp]));
  const sizeRoot = kbytes(chunkSizes(buildManifest, ["/"]));

  console.log(`JS inicial /xr/os: ${sizeXR} kB`);
  console.log(`JS inicial ${rutaApp}: ${sizeApp} kB`);
  console.log(`JS inicial layout raíz: ${sizeRoot} kB`);

  // buscar @iwer/devui y three@0.165 en nombres de chunk
  const allChunkNames = Object.values(buildManifest.pages || {}).flat();
  const bad = allChunkNames.filter(n => n.includes("@iwer/devui") || n.includes("three@0.165"));
  if (bad.length) {
    console.warn("⚠️  Chunks con dependencias no deseadas:", bad.join(", "));
  }

  // baseline layout raíz
  let baseline = { rootKB: sizeRoot };
  if (existsSync(BASE_FILE)) {
    baseline = JSON.parse(readFileSync(BASE_FILE, "utf8"));
    if (sizeRoot > baseline.rootKB) {
      console.warn(`⚠️  Layout raíz creció: ${baseline.rootKB} -> ${sizeRoot} kB`);
    }
  } else {
    mkdirSync(dirname(BASE_FILE), { recursive: true });
    writeFileSync(BASE_FILE, JSON.stringify(baseline, null, 2));
    console.log(`✅  Baseline creado en ${BASE_FILE}: ${sizeRoot} kB`);
  }
}

main();