/**
 * IDI1115N · Catálogo de un idioma: el texto fuente (español, normalizado) → su traducción.
 * Exacto primero; después los patrones con {n} (el que más texto literal fije gana).
 * `revisado` dice si una persona lo revisó o si lo rellenó una traducción automática: la
 * interfaz lo muestra siempre. Módulo PURO.
 */
import { compilarPatron, formatear, tieneValores, valoresDe, type Patron } from "./formato";

export interface DatosCatalogo {
    codigo: string;
    /** true = revisado por una persona; false = traducción automática. */
    revisado: boolean;
    entradas: Record<string, string>;
}
export interface Catalogo {
    codigo: string;
    revisado: boolean;
    tamano: number;
    /** Traduce un texto español ya normalizado; null si el catálogo no lo trae. */
    traducir(textoNormalizado: string): string | null;
}

export const normalizarTexto = (t: string): string => t.replace(/\s+/g, " ").trim();

/** Texto fijo mínimo de un patrón con valores para que pueda casar con lo que se pinta. */
export const MIN_LITERALES = 6;

export function crearCatalogo(datos: DatosCatalogo): Catalogo {
    const exactas = new Map<string, string>();
    const patrones: { p: Patron; traduccion: string; ini: string; fin: string }[] = [];
    for (const [clave, traduccion] of Object.entries(datos.entradas)) {
        if (!traduccion) continue;
        if (!tieneValores(clave)) { exactas.set(clave, traduccion); continue; }
        const p = compilarPatron(clave);
        // Un patrón casi todo valores («{0} en {1}») casaría con cualquier frase: no se usa (queda dicho en el contrato §3).
        if (p.literales < MIN_LITERALES) continue;
        patrones.push({ p, traduccion, ini: clave.slice(0, clave.indexOf("{")), fin: clave.slice(clave.lastIndexOf("}") + 1) });
    }
    patrones.sort((a, b) => b.p.literales - a.p.literales);
    return {
        codigo: datos.codigo,
        revisado: datos.revisado,
        tamano: Object.keys(datos.entradas).length,
        traducir(texto) {
            const directa = exactas.get(texto);
            if (directa !== undefined) return directa;
            for (const { p, traduccion, ini, fin } of patrones) {
                if (!texto.startsWith(ini) || !texto.endsWith(fin)) continue;
                const valores = valoresDe(p, texto);
                // un valor que a su vez es un texto del catálogo (p. ej. el título de un capítulo) también se traduce
                if (valores) return formatear(traduccion, valores.map((v) => (v && exactas.get(normalizarTexto(v))) ?? v), datos.codigo);
            }
            return null;
        },
    };
}
