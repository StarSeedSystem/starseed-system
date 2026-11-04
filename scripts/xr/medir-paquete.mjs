#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAIZ = process.env.STARSEED_ROOT || process.cwd();
const DIST = path.resolve(RAIZ, process.env.STARSEED_DIST || ".next");
const BASE = path.join(RAIZ, "starseed_memory_root/xr/paquete-base.json");
const PESADOS = ["@iwer/devui", "three@0.165"];

const leerJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const kb = (files) => Math.round(files.reduce((n, f) => {
  const abs = path.join(DIST, f);
  return n + (existsSync(abs) ? statSync(abs).size : 0);
}, 0) / 102.4) / 10;
const unicos = (files) => [...new Set(files)];

function js(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? js(p) : e.name.endsWith(".js") ? [p] : [];
  });
}

function rutasApp(dir = path.join(RAIZ, "src/app/(app)"), segs = []) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name.startsWith("(") || e.name.startsWith("_") || e.name.startsWith(".") || e.name.includes("[")) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return rutasApp(p, [...segs, e.name]);
    return /^page\.(tsx?|jsx?)$/.test(e.name) ? [`/${segs.join("/")}`] : [];
  });
}

function claveDe(paginas, ruta) {
  const clave = ruta === "/" ? "/page" : `${ruta}/page`;
  return clave in paginas ? clave : null;
}

function main() {
  if (!existsSync(DIST)) {
    console.error(`Sin build en ${path.relative(RAIZ, DIST)}/: ejecuta \`next build\` y vuelve a medir.`);
    process.exit(1);
  }
  const buildPath = path.join(DIST, "build-manifest.json");
  const appPath = path.join(DIST, "app-build-manifest.json");
  if (!existsSync(buildPath) || !existsSync(appPath)) {
    console.error(`Faltan build-manifest.json o app-build-manifest.json en ${path.relative(RAIZ, DIST)}/.`);
    process.exit(1);
  }
  const build = leerJson(buildPath);
  const app = leerJson(appPath);
  const paginas = app.pages || {};
  const rootMain = unicos(build.rootMainFiles || []);
  const claveXr = claveDe(paginas, "/xr/os");
  const rutaApp = rutasApp().find((r) => r !== "/xr/os" && claveDe(paginas, r));
  const claveApp = rutaApp ? claveDe(paginas, rutaApp) : null;

  console.log(`Paquete XR · build ${path.relative(RAIZ, DIST)}/`);
  for (const [etiqueta, clave] of [["/xr/os", claveXr], [rutaApp ?? "(app)", claveApp]]) {
    if (!clave) { console.log(`  ${etiqueta}: no está en app-build-manifest.json`); continue; }
    const jsInicial = unicos([...rootMain, ...(paginas[clave] || [])]);
    console.log(`  ${etiqueta}: ${kb(jsInicial)} kB de JS inicial (${jsInicial.length} archivos)`);
  }

  const rootKb = kb(rootMain);
  let base = null;
  try { base = leerJson(BASE); } catch { base = null; }
  if (!base) {
    mkdirSync(path.dirname(BASE), { recursive: true });
    writeFileSync(BASE, `${JSON.stringify({ rootKb, generado: new Date().toISOString() }, null, 2)}\n`);
    console.log(`  Línea base creada: layout raíz ${rootKb} kB → ${path.relative(RAIZ, BASE)}`);
  } else if (rootKb > base.rootKb + 0.05) {
    console.warn(`  AVISO: el layout raíz pasó de ${base.rootKb} a ${rootKb} kB de JS inicial.`);
  } else {
    console.log(`  Layout raíz: ${rootKb} kB (base ${base.rootKb} kB).`);
  }

  const hallados = [];
  for (const archivo of js(path.join(DIST, "static"))) {
    const texto = readFileSync(archivo, "utf8");
    for (const nombre of PESADOS) if (texto.includes(nombre)) hallados.push(`${nombre} → ${path.relative(RAIZ, archivo)}`);
  }
  if (hallados.length) console.warn(`  AVISO: motores en chunks de cliente:\n    ${hallados.join("\n    ")}`);
  else console.log(`  Sin ${PESADOS.join(" ni ")} en los chunks de cliente.`);
}

main();
