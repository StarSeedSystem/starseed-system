#!/usr/bin/env node
/**
 * StarSeed XR · medición del paquete (contrato §0.6 y §1.3; tarea XR1010AL).
 * Lee una build ya hecha (`.next/` o `STARSEED_DIST`) y NO ejecuta `next build`
 * (con el enjambre vivo no se compila). Imprime, para `/xr/os` y para una ruta
 * del grupo `(app)`, los kB de JS del primer cargado; avisa si el JS inicial del
 * layout raíz subió respecto a la línea base (`starseed_memory_root/xr/paquete-base.json`,
 * la crea la primera vez) o si se cuelan `@iwer/devui` y `three@0.165` en los chunks.
 *
 * Uso tras la siguiente `next build`:  node scripts/xr/medir-paquete.mjs [ruta-(app)]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const DIST = process.env.STARSEED_DIST || ".next";
const APP_MAN = path.join(DIST, "app-build-manifest.json");
const PAG_MAN = path.join(DIST, "build-manifest.json");
const BASE = path.join("starseed_memory_root", "xr", "paquete-base.json");
const raiz = process.cwd();

/** kB de un archivo en disco. */
const kB = (f) => Math.round(statSync(f).size / 1024);
const leerJson = (f) => JSON.parse(readFileSync(f, "utf8"));

/** Lista de chunks .js que el navegador carga al abrir la ruta (primer cargado). */
function chunksDe(ruta) {
    const claves = [`app${ruta}/page`, `app/(app)${ruta}/page`, `app${ruta}`];
    if (existsSync(APP_MAN)) {
        const paginas = leerJson(APP_MAN).pages || {};
        for (const c of claves) if (paginas[c]) return paginas[c].filter((x) => x.endsWith(".js"));
    }
    if (existsSync(PAG_MAN)) {
        const paginas = leerJson(PAG_MAN).pages || {};
        for (const c of [ruta, `/x${ruta}`]) if (paginas[c]) return paginas[c].filter((x) => x.endsWith(".js"));
    }
    return null;
}

/** kB de JS inicial de una ruta; los archivos viven bajo el distDir. */
function medir(ruta) {
    const chunks = chunksDe(ruta);
    if (!chunks) return { ruta, kB: 0, archivos: 0, fallo: true };
    const total = chunks.reduce((s, c) => s + (existsSync(path.join(raiz, DIST, c)) ? kB(path.join(raiz, DIST, c)) : 0), 0);
    return { ruta, kB: total, archivos: chunks.length, fallo: false };
}

/** Avisa: @iwer/devui (emulador en producción) y three@0.165 (copia anidada por @iwer/sem) dentro de los chunks. */
function colados() {
    const aviso = [];
    const statics = path.join(raiz, DIST, "static");
    if (!existsSync(statics)) return aviso;
    const paso = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const f = path.join(dir, e.name);
            if (e.isDirectory()) paso(f);
            else if (e.name.endsWith(".js") && statSync(f).size < 32 * 1024 * 1024) {
                const txt = readFileSync(f, "utf8");
                if (txt.includes("@iwer/devui")) aviso.push(`@iwer/devui dentro de ${path.relative(raiz, f)}`);
                if (txt.includes("three@0.165")) aviso.push(`three@0.165 dentro de ${path.relative(raiz, f)}`);
            }
        }
    };
    paso(statics);
    return aviso;
}

// ——— Programa principal ———
if (!existsSync(PAG_MAN) && !existsSync(APP_MAN)) {
    console.error(`No hay build que medir: falta ${APP_MAN} y ${PAG_MAN}.`);
    console.error("Se mide DESPUÉS de un `next build` completo (con STARSEED_DIST si se compila fuera de .next).");
    process.exit(1);
}

const ruta2d = process.argv[2] || "/genesis";
const medidas = [medir("/xr/os"), medir(ruta2d)];
for (const m of medidas) {
    if (m.fallo) console.log(`⚠ no aparece ${m.ruta} en los manifiestos de ${DIST}`);
    else console.log(`${m.ruta}: ${m.kB} kB de JS en ${m.archivos} archivos del primer cargado`);
}

// Línea base (la crea la primera vez): sube una sola si alguno crece respecto a la anterior.
const previa = existsSync(BASE) ? JSON.parse(readFileSync(BASE, "utf8")) : null;
if (!medidas[0].fallo && !medidas[1].fallo) {
    if (previa) {
        for (const m of medidas) {
            const antes = previa.rutas?.[m.ruta];
            if (antes && m.kB > antes)
                console.log(`⚠ el JS inicial de ${m.ruta} subió de ${antes} a ${m.kB} kB (revísa el layout raíz: ${path.relative(raiz, BASE)})`);
        }
    } else {
        mkdirSync(path.dirname(BASE), { recursive: true });
        writeFileSync(BASE, JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), rutas: Object.fromEntries(medidas.map((m) => [m.ruta, m.kB])) }, null, 2));
        console.log(`Línea base escrita en ${path.relative(raiz, BASE)}; desde ahora avisa si crece.`);
    }
}

// §0.6/§1.3: del emulador y la copia vieja de three NO debe entrar ni un byte a producción.
for (const a of colados()) console.log(`⚠ hay un colado: ${a}`);
if (!medidas.some((m) => m.fallo) && medidas.every((m) => m.kB > 0)) console.log("Medición completa; guarda la valoración del layout raíz tras cada `next build`.");


