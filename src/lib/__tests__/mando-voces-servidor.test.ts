import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * GUARDIÁN DEL BUILD DE SERVIDOR (Ola 275 · V5B · 2026-09-07)
 * El build de producción falló porque `/api/mando/voces` importaba `TIMBRES`
 * desde `timbres.ts`, un módulo «use client»: en el bundle de servidor el
 * import se vuelve referencia de cliente y `TIMBRES.map` revienta. V5A
 * (ba3d9fd) separó el catálogo puro en `timbres-catalogo.ts`. Este test
 * escanea el código REAL en disco para que no se repita el fallo.
 */

const RAIZ = process.cwd();
const CARPETA_API = path.join(RAIZ, "src", "app", "api");
const CARPETA_MANDO = path.join(RAIZ, "src", "lib", "mando");

/** Import de valor: archivo que importa y módulo destino resuelto. */
interface ImportValor {
    /** Ruta del importador, relativa a la raíz del repo (separadores `/`). */
    origen: string;
    /** Ruta destino resuelta (relativa, `/`), o `null` si no es `@/…`. */
    destino: string | null;
}

/**
 * Deuda heredada (2026-09-07): tres parejas previas a la regla que NO rompen
 * el build porque solo usan lo importado en TIEMPO DE PETICIÓN (la ruta se
 * evalúa al llegar el request, cuando ya hay contexto de servidor) y no en la
 * inicialización del módulo, que es donde el bundle de servidor revienta.
 * Reglas de esta lista: (1) NO se pueden añadir más parejas — una ruta nueva
 * que necesite código de un módulo cliente debe separarlo en un módulo de
 * servidor (patrón `timbres.ts` → `timbres-catalogo.ts`, V5A); (2) si una
 * pareja deja de existir en el código, el test exige quitarla de aquí para
 * que la lista no esconda deuda nueva.
 */
const DEUDA_HEREDADA = new Set([
    "src/app/api/ai/nvidia/route.ts -> src/ai/astraura/free-catalog.ts",
    "src/app/api/neurons/hermayone/bridge/route.ts -> src/lib/aurora/hermayone-bridge.ts",
    "src/app/api/neurons/hermione/bridge/route.ts -> src/lib/aurora/hermione-bridge.ts",
]);

/**
 * Quita `//…` y `/*…*​/` para no confundir un comentario con código (el fallo
 * del test V5 descartado: el comentario de cabecera MENCIONA «use client»).
 * Sin lexer perfecto: es suficiente para cabeceras de módulos del repo.
 */
function sinComentarios(codigo: string): string {
    return codigo
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|\s)\/\/[^\n]*/g, "$1 ");
}

/** Ruta absoluta → relativa a la raíz con separadores `/` (estable en tests). */
function relativa(ruta: string): string {
    return path.relative(RAIZ, ruta).split(path.sep).join("/");
}

/**
 * ¿Es un módulo de cliente? Solo si la PRIMERA línea no vacía (tras quitar
 * comentarios de cabecera) es exactamente `"use client";` / `'use client';`.
 */
function esModuloCliente(archivo: string): boolean {
    let crudo = "";
    try {
        crudo = readFileSync(archivo, "utf8");
    } catch {
        return false;
    }
    const limpio = sinComentarios(crudo);
    const primera = limpio.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
    return /^["']use client["'];?$/.test(primera);
}

/** Recorre `dir` (y subcarpetas) devolviendo los archivos que pasan `acepta`. */
function recorrer(dir: string, acepta: (ruta: string) => boolean, salida: string[] = []): string[] {
    let entradas: string[] = [];
    try {
        entradas = readdirSync(dir);
    } catch {
        return salida;
    }
    for (const nombre of entradas) {
        if (nombre === "node_modules" || nombre === "__tests__" || nombre.startsWith(".")) continue;
        const ruta = path.join(dir, nombre);
        let info;
        try {
            info = statSync(ruta);
        } catch {
            continue;
        }
        if (info.isDirectory()) {
            recorrer(ruta, acepta, salida);
        } else if (acepta(ruta)) {
            salida.push(ruta);
        }
    }
    return salida;
}

/**
 * ¿La cláusula importa ALGO en tiempo de ejecución? Ignora `import type {…}`
 * y `import { type X, type Y }` (todos los símbolos con `type`). Un valor
 * cualquiera (`import x from`, `import * as x`, llaves mezcladas) sí cuenta.
 */
function esClausulaDeValor(clausula: string): boolean {
    const sinTypeInicial = clausula.replace(/^\s*type\s+/, "").trim();
    if (sinTypeInicial === "" || /^type[\s,{]/.test(clausula)) return false;
    const llaves = sinTypeInicial.match(/\{([^}]*)\}/);
    if (llaves) {
        const simbolos = llaves[1].split(",").map((s) => s.trim()).filter((s) => s !== "");
        if (simbolos.length > 0 && simbolos.every((s) => /^type\s/.test(s))) return false;
    }
    return true;
}

/** Resuelve un especificador `@/…` a un archivo real: `.ts`, `.tsx`, `/index.ts`. */
function resolverRuta(espec: string): string | null {
    if (!espec.startsWith("@/")) return null;
    const base = path.join(RAIZ, "src", espec.slice(2));
    const candidatos = [
        `${base}.ts`,
        `${base}.tsx`,
        path.join(base, "index.ts"),
        path.join(base, "index.tsx"),
    ];
    for (const candidato of candidatos) {
        try {
            statSync(candidato);
            return candidato;
        } catch {
            // siguiente candidato
        }
    }
    return null;
}

/** Imports de VALOR de un archivo, con el destino resuelto (o `null` si no `@/…`). */
function importsDeValor(archivo: string): ImportValor[] {
    const codigo = sinComentarios(readFileSync(archivo, "utf8"));
    const salidas: ImportValor[] = [];
    const re = /import\s+([^'"]+?)\s+from\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(codigo)) !== null) {
        if (!esClausulaDeValor(m[1])) continue;
        salidas.push({ origen: relativa(archivo), destino: m[2] });
    }
    return salidas;
}

    /** Archivos vigilados: rutas `route.ts` de `/api` y `src/lib/mando` (recursivo, solo `.ts`). */
function archivosVigilados(): string[] {
    const esRutaApi = (ruta: string) => ruta.endsWith("route.ts");
    const esMando = (ruta: string) => ruta.endsWith(".ts");
    return [...recorrer(CARPETA_API, esRutaApi), ...recorrer(CARPETA_MANDO, esMando)];
}

/** Parejas «origen -> destino» (relativas) cuyo destino es módulo «use client». */
function parejasCliente(): Set<string> {
    const parejas = new Set<string>();
    for (const archivo of archivosVigilados()) {
        for (const imp of importsDeValor(archivo)) {
            const destino = imp.destino !== null ? resolverRuta(imp.destino) : null;
            if (destino && esModuloCliente(destino)) {
                parejas.add(`${imp.origen} -> ${relativa(destino)}`);
            }
        }
    }
    return parejas;
}

describe("rutas de servidor: ninguna importa un módulo «use client» (Ola 275 · V5B)", () => {
    it("una ruta nueva que importe un módulo cliente rompe el build — solo se tolera la deuda heredada", () => {
        const encontradas = parejasCliente();
        const nuevas = [...encontradas].filter((p) => !DEUDA_HEREDADA.has(p));
        // El import con valor arrastra el módulo al bundle de servidor: en el
        // build ligero, `TIMBRES` dejaba de ser un array (`TIMBRES.map is not
        // a function`). La deuda heredada solo se sostiene porque usa lo
        // importado en tiempo de petición; NO se pueden añadir más parejas.
        expect(
            nuevas,
            "ruta de servidor que importa un módulo «use client»: muévelo a un módulo de servidor (patrón timbres-catalogo.ts):\n" +
                nuevas.join("\n"),
        ).toEqual([]);
    });

    it("si una pareja de la deuda heredada ya no existe, quítala de DEUDA_HEREDADA", () => {
        const encontradas = parejasCliente();
        const saldadas = [...DEUDA_HEREDADA].filter((p) => !encontradas.has(p));
        // La lista viva: si la pareja desaparece del código, la entrada se
        // vuelve mentira y esconde deuda nueva. Debe ser exactamente la actual.
        expect(
            saldadas,
            "deuda saldada: quítala de DEUDA_HEREDADA",
        ).toEqual([]);
    });

    it("la deuda heredada son exactamente las tres parejas documentadas", () => {
        const encontradas = parejasCliente();
        expect([...encontradas].sort()).toEqual([...DEUDA_HEREDADA].sort());
    });
});

describe("timbres-catalogo.ts: módulo de servidor puro (Ola 275 · V5A)", () => {
    const CATALOGO = path.join(RAIZ, "src", "lib", "aurora", "timbres-catalogo.ts");

    it("no contiene «use client» ni localStorage (comprobado en código, no en comentarios)", () => {
        const codigo = sinComentarios(readFileSync(CATALOGO, "utf8"));
        expect(codigo.includes("use client"), "el catálogo puro no debe ser un módulo de cliente").toBe(false);
        expect(codigo.includes("localStorage"), "el catálogo puro no debe tocar localStorage del navegador").toBe(false);
    });

    it("exporta TIMBRES (el catálogo que las rutas /api/mando/* importan)", () => {
        const codigo = sinComentarios(readFileSync(CATALOGO, "utf8"));
        expect(/export const TIMBRES/.test(codigo), "falta `export const TIMBRES` en timbres-catalogo.ts").toBe(true);
    });
});


