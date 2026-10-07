/**
 * El Puente de Mando se llama **Genesis** (Alex, 2026-10-07): «en todo StarSeed OS, en todos
 * sus contextos, tanto para individuales como grupales y comunales».
 *
 * Esta guardia recorre `src/` y falla si un texto o comentario vuelve a decir «Puente de
 * Mando», «Centro de Mando» o «Mando» a secas. NO mira identificadores de código: la carpeta
 * `src/lib/mando`, las rutas `/api/mando/*`, las tablas `mando_*`, `guardianMando`… siguen
 * llamándose así a propósito (cambiarlos rompería servicios, migraciones y el enjambre).
 *
 * Si te salta: escribe «Genesis» («el Mando» → «Genesis», «del Mando» → «de Genesis»,
 * «Mando para todos» → «Genesis para todos»). La página es `/genesis` (la vieja `/mando`
 * redirige).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(__dirname, "..", "..");
const ESTE = path.relative(SRC, __filename);
/** Los únicos que pueden nombrar lo viejo: la migración del botón guardado del dock, que
 *  tiene que reconocer la etiqueta «Mando» para cambiarla, y su prueba. */
const PERMITIDOS = new Set(["lib/dock/dock-defaults.ts", "lib/dock/__tests__/dock-defaults.test.ts"]);
const NOMBRE_VIEJO = /[Pp]uente\s+de\s+[Mm]ando|Centro de Mando|(?<![\p{L}\p{N}_/.\-@])Mandos?(?![\p{L}\p{N}_@])(?! central de audio)/gu;

function recorrer(dir: string, salida: string[] = []): string[] {
    for (const nombre of readdirSync(dir)) {
        const ruta = path.join(dir, nombre);
        if (statSync(ruta).isDirectory()) recorrer(ruta, salida);
        else if (/\.(tsx?|css|json|md)$/.test(nombre)) salida.push(ruta);
    }
    return salida;
}

export function apariciones(texto: string): string[] {
    return [...texto.matchAll(NOMBRE_VIEJO)].map((m) => m[0]);
}

describe("el producto se llama Genesis", () => {
    it("ningún texto de src/ dice «Puente de Mando», «Centro de Mando» ni «Mando» a secas", () => {
        const fallos: string[] = [];
        for (const archivo of recorrer(SRC)) {
            const relativo = path.relative(SRC, archivo);
            if (relativo === ESTE || PERMITIDOS.has(relativo.split(path.sep).join("/"))) continue;
            const lineas = readFileSync(archivo, "utf8").split("\n");
            lineas.forEach((linea, i) => {
                if (apariciones(linea).length) fallos.push(`src/${relativo}:${i + 1}: ${linea.trim().slice(0, 120)}`);
            });
        }
        expect(fallos, `Escribe «Genesis» (ver la cabecera de esta prueba):\n${fallos.join("\n")}`).toEqual([]);
    });

    it("la guardia no confunde identificadores ni rutas con el nombre", () => {
        expect(apariciones("import { guardianMando } from '@/lib/mando/guardian'")).toEqual([]);
        expect(apariciones("fetch('/api/mando/estado'); STARSEED_MANDO_TODOS; @@MANDO@@; mando_tareas")).toEqual([]);
        expect(apariciones("<CentroMando /> y Mando central de audio")).toEqual([]);
        expect(apariciones("Abrir el Puente de Mando")).toEqual(["Puente de Mando"]);
        expect(apariciones("«No tienes permiso en este Mando.»")).toEqual(["Mando"]);
        expect(apariciones("Centro de Mando")).toEqual(["Centro de Mando"]);
    });
});
