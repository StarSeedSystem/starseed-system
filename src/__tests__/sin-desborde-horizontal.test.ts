import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const RAIZ = join(__dirname, "..", "..");
// Solo las superficies ya adaptadas a pantallas chicas. Ampliar la lista
// cuando se arregle otra carpeta; escanear todo src/ falla en cientos de sitios previos.
const CARPETAS_ESCANEAR = [
    "src/components/control-remoto",
    "src/components/mesh/mapa-senales",
    "src/components/mesh/signals-center.tsx",
    "src/app/(app)/senales",
];

const EXTENSIONES = new Set([".tsx", ".ts", ".jsx", ".js"]);

function *walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== ".next") {
                yield* walk(ruta);
            }
        } else if (EXTENSIONES.has(extname(entry.name))) {
            yield ruta;
        }
    }
}

function leerArchivos(): Map<string, string> {
    const mapa = new Map<string, string>();
    for (const carpeta of CARPETAS_ESCANEAR) {
        const rutaAbs = join(RAIZ, carpeta);
        try {
            if (statSync(rutaAbs).isFile()) {
                mapa.set(relative(RAIZ, rutaAbs), readFileSync(rutaAbs, "utf8"));
            } else {
                for (const archivo of walk(rutaAbs)) {
                    const contenido = readFileSync(archivo, "utf8");
                    mapa.set(relative(RAIZ, archivo), contenido);
                }
            }
        } catch {
            // carpeta no existe
        }
    }
    return mapa;
}

interface Problema {
    archivo: string;
    linea: number;
    columna: number;
    tipo: "ancho-fijo-sin-maxw" | "nowrap-sin-wrap" | "grid-cols-sin-responsive";
    fragmento: string;
    detalle: string;
}

function analizarArchivo(archivo: string, contenido: string): Problema[] {
    const problemas: Problema[] = [];
    const lineas = contenido.split("\n");

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        const numLinea = i + 1;

        // 1. Anchos fijos > 360px sin max-w (w-[>360px], width: >360px, min-w-[>360px])
        const matchesAncho = linea.matchAll(/(?:^|\s)(?:w|min-w|max-w|width)\[([^\]]+)\]/g);
        for (const m of matchesAncho) {
            const valor = m[1].trim();
            const pxMatch = valor.match(/^(\d+(?:\.\d+)?)px$/);
            const remMatch = valor.match(/^(\d+(?:\.\d+)?)rem$/);
            let px = 0;
            if (pxMatch) px = parseFloat(pxMatch[1]);
            else if (remMatch) px = parseFloat(remMatch[1]) * 16;
            if (px > 360) {
                // Verificar si hay max-w en la misma línea o clase
                const tieneMaxW = /max-w-\[/.test(linea) || /max-w-(xs|sm|md|lg|xl|2xl|full|screen)/.test(linea);
                if (!tieneMaxW) {
                    problemas.push({
                        archivo,
                        linea: numLinea,
                        columna: m.index ?? 0,
                        tipo: "ancho-fijo-sin-maxw",
                        fragmento: linea.trim().slice(0, 120),
                        detalle: `Ancho fijo ${valor} (${px}px) > 360px sin max-w correspondiente`,
                    });
                }
            }
        }

        // 2. whitespace-nowrap / whitespace-nowrap en filas flex sin flex-wrap
        if (/\bwhitespace-nowrap\b/.test(linea)) {
            // Buscar hacia atrás si hay flex sin flex-wrap en contexto cercano
            const contexto = lineas.slice(Math.max(0, i - 3), i + 1).join(" ");
            const tieneFlex = /\bflex\b/.test(contexto);
            const tieneWrap = /\bflex-wrap\b/.test(contexto) || /\bflex-nowrap\b/.test(contexto);
            if (tieneFlex && !tieneWrap) {
                problemas.push({
                    archivo,
                    linea: numLinea,
                    columna: linea.indexOf("whitespace-nowrap"),
                    tipo: "nowrap-sin-wrap",
                    fragmento: linea.trim().slice(0, 120),
                    detalle: "whitespace-nowrap en contenedor flex sin flex-wrap explícito",
                });
            }
        }

        // 3. grid-cols fijos sin variante responsive (grid-cols-12, grid-cols-[...] sin sm:md:lg:)
        const matchesGrid = linea.matchAll(/(?:^|\s)grid-cols-(\d+|\[[^\]]+\])/g);
        for (const m of matchesGrid) {
            const valor = m[1];
            // Verificar si hay prefijos responsive en la misma clase
            const claseCompleta = linea.slice(Math.max(0, m.index! - 20), m.index! + m[0].length + 5);
            const tieneResponsive = /(sm|md|lg|xl|2xl):/.test(claseCompleta);
            if (!tieneResponsive && !valor.startsWith("[")) {
                problemas.push({
                    archivo,
                    linea: numLinea,
                    columna: m.index ?? 0,
                    tipo: "grid-cols-sin-responsive",
                    fragmento: linea.trim().slice(0, 120),
                    detalle: `grid-cols-${valor} fijo sin variante responsive (sm:/md:/lg:) para pantallas chicas`,
                });
            }
        }
    }
    return problemas;
}

describe("Sin desborde horizontal en pantallas chicas (≤360px)", () => {
    const archivos = leerArchivos();
    const todosProblemas: Problema[] = [];

    for (const [archivo, contenido] of archivos) {
        const problemas = analizarArchivo(archivo, contenido);
        todosProblemas.push(...problemas);
    }

    // Agrupar por tipo para reporte claro
    const porTipo = new Map<string, Problema[]>();
    for (const p of todosProblemas) {
        const arr = porTipo.get(p.tipo) ?? [];
        arr.push(p);
        porTipo.set(p.tipo, arr);
    }

    it("no debe haber anchos fijos > 360px sin max-w", () => {
        const problemas = porTipo.get("ancho-fijo-sin-maxw") ?? [];
        if (problemas.length > 0) {
            const detalle = problemas
                .map((p) => `${p.archivo}:${p.linea}:${p.columna} → ${p.detalle} | ${p.fragmento}`)
                .join("\n");
            throw new Error(`Se encontraron ${problemas.length} anchos fijos > 360px sin max-w:\n${detalle}`);
        }
        expect(problemas.length).toBe(0);
    });

    it("no debe haber whitespace-nowrap en flex sin flex-wrap", () => {
        const problemas = porTipo.get("nowrap-sin-wrap") ?? [];
        if (problemas.length > 0) {
            const detalle = problemas
                .map((p) => `${p.archivo}:${p.linea}:${p.columna} → ${p.detalle} | ${p.fragmento}`)
                .join("\n");
            throw new Error(`Se encontraron ${problemas.length} casos de whitespace-nowrap sin flex-wrap:\n${detalle}`);
        }
        expect(problemas.length).toBe(0);
    });

    it("no debe haber grid-cols fijos sin variante responsive", () => {
        const problemas = porTipo.get("grid-cols-sin-responsive") ?? [];
        if (problemas.length > 0) {
            const detalle = problemas
                .map((p) => `${p.archivo}:${p.linea}:${p.columna} → ${p.detalle} | ${p.fragmento}`)
                .join("\n");
            throw new Error(`Se encontraron ${problemas.length} grid-cols fijos sin responsive:\n${detalle}`);
        }
        expect(problemas.length).toBe(0);
    });
});