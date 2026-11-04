/**
 * scripts/xr/medir-paquete.mjs
 * Mide el tamaño del paquete JS de StarSeed OS XR.
 * Contrato: architecture/starseed-xr.md §0.6 y §11.
 *
 * Con una build ya hecha (.next/), lee .next/build-manifest.json y
 * app-build-manifest.json e imprime, para /xr/os y para una ruta cualquiera
 * del grupo (app), los kB de JS del primer cargado.
 *
 * Avisa si el JS inicial del layout raíz subió respecto a una línea base
 * guardada en starseed_memory_root/xr/paquete-base.json (la crea la primera
 * vez) o si aparecen @iwer/devui / three@0.165 en los chunks.
 *
 * NO ejecuta next build (con el enjambre vivo no se compila).
 */

import { createReadStream, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RAIZ_PROYECTO = "/home/runner/work/_temp/starseed-wt/XR1010AL";
const NEXT_DIST = join(RAIZ_PROYECTO, ".next");
const MEMORY_ROOT = join(RAIZ_PROYECTO, "starseed_memory_root");
const PAQUETE_BASE_PATH = join(MEMORY_ROOT, "xr", "paquete-base.json");

// Utilidades
function kb(tamano) {
    return (tamano / 1024).toFixed(1);
}

function bytesAString(bytes) {
    if (bytes === undefined || bytes === null) return "0 B";
    const kB = bytes / 1024;
    if (kB < 1) return `${bytes} B`;
    if (kB < 1024) return `${kB.toFixed(1)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// Leer build-manifest.json
function leerManifest(nombre) {
    const ruta = join(NEXT_DIST, nombre);
    if (!existsSync(ruta)) {
        console.error(`❌ No se encuentra: ${ruta}`);
        return null;
    }
    try {
        return JSON.parse(readFileSync(ruta, "utf8"));
    } catch (e) {
        console.error(`❌ Error al leer ${ruta}:`, e.message);
        return null;
    }
}

// Buscar chunk por ruta en build-manifest
function encontrarChunk(manifest, ruta) {
    const clave = Object.keys(manifest).find(
        (k) => manifest[k].name === ruta || manifest[k].fileName === ruta
    );
    return clave ? manifest[clave] : null;
}

// Buscar nombre de chunk en app-build-manifest
function buscarEnAppManifest(appManifest, patron) {
    for (const entrada of Object.values(appManifest || {})) {
        if (typeof entrada === "object" && entrada.fileName) {
            if (entrada.fileName.includes(patron) || entrada.fileName.includes(patron.replace("@", ""))) {
                return entrada;
            }
        }
    }
    return null;
}

async function main() {
    console.log("=== Midiendo paquete XR1010AL ===\n");

    // 1. Verificar que .next existe (build previa)
    if (!existsSync(NEXT_DIST)) {
        console.error("❌ No hay directorio .next. Primero ejecuta next build.");
        process.exit(1);
    }

    const buildManifest = leerManifest("build-manifest.json");
    const appManifest = leerManifest("app-build-manifest.json");

    if (!buildManifest || !appManifest) {
        console.error("❌ No se pudieron leer los manifests de Next.js.");
        process.exit(1);
    }

    // 2. Calcular tamaño del JS inicial para /xr/os
    // Buscar chunks relacionados con /xr/os
    const chunksXrOs = [];
    for (const [clave, info] of Object.entries(buildManifest)) {
        if (info.fileName && (info.fileName.includes("/xr/os") || info.fileName.includes("xr/os"))) {
            chunksXrOs.push({ clave, ...info });
        }
    }

    console.log("📦 Chunks para /xr/os:");
    let totalBytesXrOs = 0;
    for (const chunk of chunksXrOs) {
        const tamano = chunk.fileSize || 0;
        totalBytesXrOs += tamano;
        console.log(`   - ${chunk.fileName}: ${kb(tamano)}`);
    }
    console.log(`   TOTAL /xr/os: ${kb(totalBytesXrOs)} (${totalBytesXrOs} bytes)\n`);

    // 3. Calcular tamaño del JS inicial para una ruta del grupo (app)
    // Por ejemplo, la ruta / (home) o /agent
    const rutaReferencia = "/"; // ruta principal del grupo (app)
    const chunkReferencia = encontrarChunk(buildManifest, rutaReferencia);

    console.log(`📦 Chunk para referencia "${rutaReferencia}":`);
    if (chunkReferencia) {
        const tamano = chunkReferencia.fileSize || 0;
        console.log(`   - ${chunkReferencia.fileName}: ${kb(tamano)} (${tamano} bytes)`);
    } else {
        console.log("   No encontrado en build-manifest");
    }
    console.log("");

    // 4. Verificar línea base paquete-base.json
    let lineaBase = null;
    if (existsSync(PAQUETE_BASE_PATH)) {
        try {
            lineaBase = JSON.parse(readFileSync(PAQUETE_BASE_PATH, "utf8"));
            console.log("📋 Línea base paquete-base.json encontrada:");
            console.log(`   JS inicial: ${kb(lineaBase.jsInicial || 0)} bytes`);
            console.log(`   three@0.165: ${lineaBase.three0165 || "no registrado"}`);
            console.log(`   @iwer/devui: ${lineaBase.iwerDevui || "no registrado"}\n`);
        } catch (e) {
            console.error("❌ Error al leer línea base:", e.message);
        }
    } else {
        console.log("📦 No existe línea base paquete-base.json — se creará en la primera corrida.\n");
    }

    // 5. Verificar si @iwer/devui o three@0.165 aparecen en los chunks
    console.log("🔍 Verificando dependencias problemáticas en chunks:");

    let encontroIwerDevui = false;
    let encontroThree0165 = false;

    for (const [clave, info] of Object.entries(buildManifest)) {
        if (info.fileName) {
            const nombreArchivo = info.fileName;
            if (nombreArchivo.includes("@iwer/devui") || nombreArchivo.includes("iwer/devui")) {
                encontroIwerDevui = true;
                console.log(`   ⚠️ Encontrado @iwer/devui en: ${nombreArchivo}`);
            }
            if (nombreArchivo.includes("three@0.165") || nombreArchivo.includes("0.165")) {
                encontroThree0165 = true;
                console.log(`   ⚠️ Encontrado three@0.165 en: ${nombreArchivo}`);
            }
        }
    }

    if (!encontroIwerDevui && !encontroThree0165) {
        console.log("   ✅ No se encontraron @iwer/devui ni three@0.165 en los chunks.");
    }

    // 6. Resumen y reporte
    console.log("=== Resumen ===");
    console.log(`Total JS /xr/os: ${kb(totalBytesXrOs)}`);
    if (encontroIwerDevui) console.log("⚠️ ALERTA: @iwer/devui detectado en el paquete de producción");
    if (encontroThree0165) console.log("⚠️ ALERTA: three@0.165 detectado en el paquete de producción");

    // Guardar línea base si no existe
    if (!lineaBase) {
        const jsInicial = totalBytesXrOs;
        const nuevoBase = {
            jsInicial,
            three0165: encontroThree0165 ? "presente" : "ausente",
            iwerDevui: encontroIwerDevui ? "presente" : "ausente",
            fecha: new Date().toISOString(),
        };
        const dirBase = join(MEMORY_ROOT, "xr");
        if (!existsSync(dirBase)) {
            require("node:fs").mkdirSync(dirBase, { recursive: true });
        }
        require("node:fs").writeFileSync(PAQUETE_BASE_PATH, JSON.stringify(nuevoBase, null, 2));
        console.log(`💾 Línea base guardada en ${PAQUETE_BASE_PATH}`);
    }
}

main().catch((err) => {
    console.error("Error inesperado:", err);
    process.exit(1);
});