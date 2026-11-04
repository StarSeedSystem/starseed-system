#!/usr/bin/env node
/**
 * Mide el paquete XR sobre una build YA hecha (XR1010AL · contrato `architecture/starseed-xr.md` §1.3).
 * NO ejecuta `next build`: con el enjambre vivo no se compila. Uso, después de compilar:
 *   node scripts/xr/medir-paquete.mjs
 * Opcional: `XR_DIST` (otra carpeta de build) y `XR_BASE` (otra línea base).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.resolve(RAIZ, process.env.XR_DIST ?? ".next");
const BASE = path.resolve(RAIZ, process.env.XR_BASE ?? "starseed_memory_root/xr/paquete-base.json");
const MANIFIESTOS = [
    path.join(DIST, "build-manifest.json"),
    path.join(DIST, "app-build-manifest.json"),
    path.join(DIST, "server/app-build-manifest.json"),
];
const leerJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

function archivosJs(dir, acc = []) {
    if (!existsSync(dir)) return acc;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "cache") archivosJs(p, acc); }
        else if (e.name.endsWith(".js")) acc.push(p);
    }
    return acc;
}

function tam(rels) {
    let total = 0;
    for (const rel of new Set(rels)) {
        try { total += statSync(path.join(DIST, rel)).size; } catch { /* chunk ausente */ }
    }
    return total;
}

const build = leerJson(MANIFIESTOS[0]);
const app = leerJson(MANIFIESTOS[1]) ?? leerJson(MANIFIESTOS[2]);
if (!build || !app) {
    console.error(`No hay build en ${path.relative(RAIZ, DIST) || "."}: faltan build-manifest.json o app-build-manifest.json.`);
    console.error("No se compila aquí (enjambre vivo). Mide después de la próxima `next build`.");
    process.exit(1);
}

const paginas = app.pages ?? {};
const claveDe = (ruta) => Object.keys(paginas).find((k) => k === ruta || k === `${ruta}/page` || k.endsWith(`${ruta}/page`));
const compartido = [...(build.polyfillFiles ?? []), ...(build.rootMainFiles ?? []), ...((build.pages ?? {})["/_app"] ?? [])];
const rutasApp = Object.keys(paginas).filter((k) => k.endsWith("/page")).map((k) => ({ clave: k, ruta: k.replace(/\/page$/, "") }));
const elegida = rutasApp.find((x) => x.ruta.includes("(app)") && !x.ruta.includes("/xr/os")) ?? rutasApp.find((x) => !x.ruta.includes("/xr/os"));
const medidas = [{ etiqueta: "/xr/os", clave: claveDe("/xr/os") }];
if (elegida) medidas.push({ etiqueta: elegida.ruta.replace(/\/\([^/]+\)/g, ""), clave: elegida.clave });
for (const { etiqueta, clave } of medidas) {
    const propios = clave ? paginas[clave] ?? [] : [];
    console.log(`${etiqueta}: ${kb(tam([...compartido, ...propios]))} de JS inicial (${propios.length} chunks propios)`);
    if (!clave) console.warn(`AVISO: ${etiqueta} no aparece en app-build-manifest.json.`);
}

const inicial = tam(compartido);
const previo = leerJson(BASE);
const anterior = typeof previo?.jsInicialBytes === "number" ? previo.jsInicialBytes : null;
if (anterior === null) {
    mkdirSync(path.dirname(BASE), { recursive: true });
    writeFileSync(BASE, `${JSON.stringify({ jsInicialBytes: inicial, medidoEn: new Date().toISOString() }, null, 2)}\n`);
    console.log(`Línea base creada: layout raíz ${kb(inicial)} → ${path.relative(RAIZ, BASE)}`);
} else if (inicial > anterior) {
    console.warn(`AVISO: el JS inicial del layout raíz subió de ${kb(anterior)} a ${kb(inicial)} (+${kb(inicial - anterior)}).`);
} else {
    console.log(`Layout raíz: ${kb(inicial)} (línea base ${kb(anterior)}).`);
}

for (const f of archivosJs(path.join(DIST, "static"))) {
    const contenido = readFileSync(f, "utf8");
    for (const nombre of ["@iwer/devui", "three@0.165"]) {
        if (contenido.includes(nombre)) console.warn(`AVISO: ${nombre} aparece en ${path.relative(DIST, f)}.`);
    }
}
