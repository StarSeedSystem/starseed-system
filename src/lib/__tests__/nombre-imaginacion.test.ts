/**
 * El sistema de propuestas del OS se llama **Imaginación** (Ola 1021I,
 * `architecture/imaginacion-autodesarrollo.md` §2): «Imaginación profunda» (la flota de
 * análisis del 29-09), «Imaginación diaria», «sesión de imaginación».
 *
 * Esta guardia recorre `src/components/mando` y `src/lib/mando` (sin `__tests__`) y falla si
 * un texto vuelve a decir «Sueños profundos», «sueño(s) profundo(s)» o «Dream» a secas.
 * NO mira identificadores: `suenos.py`, `panel-suenos.tsx`, `/api/mando/suenos`, el prefijo
 * `cola-suenos-` (los orquestadores lo usan para APARTARSE) ni `panel="suenos"` siguen
 * llamándose así a propósito; cambia el texto, no el id.
 *
 * Si te salta: escribe «Imaginación» («sueños profundos» → «imaginación profunda»,
 * «Dream diario» → «imaginación diaria»). La imaginación propia de Astraura no se toca.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(__dirname, "..", ".."); /* `src/` */
/** Los dos árboles que mira la guardia (el contrato de la Ola 1021I), rutas relativas a `src/`. */
const ARBOLES = ["components/mando", "lib/mando"] as const;
/**
 * Archivos que hoy conservan el nombre viejo en comentarios históricos del 2026-09-29
 * (los renombra la cadena de la Ola 1021I, no esta tarea, cuyo alcance es solo
 * `centro-mando.tsx`): mientras sus tareas no se integren, la guardia los deja pasar
 * para estar en verde con el código de hoy. CUANDO se renombren, quita su entrada para
 * que la guardia vuelva a mirarlos — esta lista solo debe encoger, nunca crecer.
 */
const PERMITIDOS = new Set<string>([
    // Contrato de la Ola 1021I §2: lee prompts viejos que hablan del «Dream» a secas.
    "lib/mando/lector-local.ts",
    // Comentarios del 2026-09-29 sobre la sesión de análisis («su informe»), pendientes
    // de sus tareas de renombrado (IMN1021K1–K4).
    "lib/mando/ramificacion.ts",
    "lib/mando/tipos.ts",
    "lib/mando/grafo-disposicion.ts",
    "lib/mando/director-datos.ts",
    "components/mando/disenador-ola.tsx",
    "components/mando/ramificacion-agentes.tsx",
]);
/** «sueño(s) profundo(s)» en cualquier combinación de singular y plural… */
const PROFUNDOS = /\bsueños? profundos?\b/gi;
/** …y «Dream» como palabra suelta, pero NO «Ola Dream» (nombre histórico de las olas). */
const DREAM = /(?<!Ola )\bDream\b/g;

/**
 * Recorre un árbol de carpetas mirando solo texto y código (`.tsx?`, `.css`, `.json`, `.md`),
 * saltándose `__tests__`: la guardia vigila el PRODUCTO, no sus propias pruebas.
 */
function recorrer(dir: string, salida: string[] = []): string[] {
    for (const nombre of readdirSync(dir)) {
        const ruta = path.join(dir, nombre);
        if (statSync(ruta).isDirectory()) {
            if (nombre === "__tests__") continue;
            recorrer(ruta, salida);
        } else if (/\.(tsx?|css|json|md)$/.test(nombre)) salida.push(ruta);
    }
    return salida;
}

/** Las apariciones del nombre viejo en un texto, EN ORDEN (pura; la usan los ejemplos). */
export function apariciones(texto: string): string[] {
    const todas = [...texto.matchAll(PROFUNDOS), ...texto.matchAll(DREAM)];
    return todas.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((m) => m[0]);
}

describe("el sistema de propuestas se llama Imaginación", () => {
    it("ningún texto de mando dice «sueño(s) profundo(s)» ni «Dream» a secas", () => {
        const fallos: string[] = [];
        for (const arbol of ARBOLES) {
            for (const archivo of recorrer(path.join(RAIZ, arbol))) {
                const relativo = path.relative(RAIZ, archivo).split(path.sep).join("/");
                if (PERMITIDOS.has(relativo)) continue;
                const lineas = readFileSync(archivo, "utf8").split("\n");
                lineas.forEach((linea, i) => {
                    if (apariciones(linea).length)
                        fallos.push(`src/${relativo}:${i + 1}: ${linea.trim().slice(0, 120)}`);
                });
            }
        }
        expect(
            fallos,
            `Escribe «Imaginación» (ver la cabecera de esta prueba):\n${fallos.join("\n")}`,
        ).toEqual([]);
    });

    it("la guardia no confunde identificadores ni el nombre histórico de las olas", () => {
        expect(apariciones('panel="suenos" /api/mando/suenos cola-suenos-reimaginar suenos.py')).toEqual([]);
        expect(apariciones("la imaginación profunda y el medidor «Imaginación» del pulso")).toEqual([]);
        expect(apariciones("la carpeta dream/ y el modo onírico, nunca igualados")).toEqual([]);
        expect(apariciones("Sueños profundos")).toEqual(["Sueños profundos"]);
        expect(apariciones("un sueño profundo y dos sueños profundos")).toEqual([
            "sueño profundo",
            "sueños profundos",
        ]);
        expect(apariciones("Ola Dream 2026-09-22 · x — y «Ola Dream»")).toEqual([]);
        expect(apariciones("la sesión la escribió el Dream")).toEqual(["Dream"]);
        expect(apariciones("Stir dream pancakes")).toEqual([]);
    });
});
