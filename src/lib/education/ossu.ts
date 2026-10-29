/*
 * ossu — Currículo abierto de OSSU (computer-science) como DATOS del Módulo
 * Educación (Ola 1025R, INF1025D): 63 cursos en 15 secciones en
 * `config/educacion-ossu.json`. Módulo PURO: sin red, disco ni reloj. El dato
 * original está en inglés (tal cual); lo añadido para personas, en español.
 * LICENCIA: MIT cubre la lista; el OS ENLAZA los cursos de sus anfitriones,
 * nunca copia ni redistribuye su material (ver AVISO_LICENCIA_OSSU).
 */

import datosOssu from "../../../config/educacion-ossu.json";
import type { GuideSection, GuideResource, GuideKind } from "@/lib/education/study";

export interface CursoOssu {
    orden: number; bloque: string; seccion: string; opcional_a_elegir: boolean;
    nombre: string; url: string; anfitrion: string; requisitos: string;
    duracion: string; esfuerzo: string;
    /** Alternativas del curso, tal cual en el dato. */
    alternativas: { nombre: string; url: string }[];
    /** Id del nodo del catálogo de Educación (src/lib/education/curriculum.ts). */
    nodo: string;
}

export interface SeccionOssu {
    seccion: string; bloque: string; temas: string[]; /** Órdenes de los cursos. */ cursos: number[];
    nodo: string;
}

export const AVISO_LICENCIA_OSSU: string = datosOssu.aviso_licencia;

export function versionOssu(): { commit: string; fecha: string } {
    return { commit: datosOssu.commit_main, fecha: datosOssu.fecha_commit };
}

export function seccionesOssu(): SeccionOssu[] {
    return datosOssu.secciones;
}

export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return datosOssu.cursos.filter((c) => c.nodo === nodoId);
}

/** Nodos del catálogo de Educación que OSSU alimenta, en orden de aparición. */
export function nodosConOssu(): string[] {
    const vistos = new Set<string>();
    for (const s of datosOssu.secciones) vistos.add(s.nodo);
    for (const c of datosOssu.cursos) vistos.add(c.nodo);
    return [...vistos];
}

// ── Búsqueda: sin acentos ni mayúsculas; cada palabra de la consulta debe ──
// ── aparecer en el nombre del curso o en los temas de su sección.        ──

/** Puente español→inglés: el dato de OSSU está en inglés, la consulta suele llegar en español. */
const SINONIMOS: Record<string, string[]> = {
    seguridad: ["security", "secure"], criptografia: ["cryptography", "cryptographic"],
    computacion: ["computation", "computing"], programacion: ["programming"],
    algoritmos: ["algorithm", "algorithms"], algoritmo: ["algorithm"],
    bases: ["database"], datos: ["data"], redes: ["network"], red: ["network"],
};

/** Palabras de relleno que no determinan la búsqueda. */
const VACIAS = new Set(["de", "la", "el", "los", "las", "y", "en", "con", "a"]);

function normalizar(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = normalizar(consulta)
        .split(/\s+/)
        .filter((p) => p && !VACIAS.has(p));
    if (palabras.length === 0) return [];
    const temasPorSeccion = new Map<string, string>(
        datosOssu.secciones.map((s) => [s.seccion, normalizar(s.temas.join(" "))]),
    );
    const resultados = datosOssu.cursos
        .filter((c) => {
            const blanco = `${normalizar(c.nombre)} ${temasPorSeccion.get(c.seccion) ?? ""}`;
            return palabras.every((p) =>
                [p, ...(SINONIMOS[p] ?? [])].some((candidato) => blanco.includes(candidato)),
            );
        })
        .sort((a, b) => a.orden - b.orden);
    return max > 0 ? resultados.slice(0, max) : resultados;
}

// ── Itinerario: compatible con UpsertGuideInput (study.ts). Una sección ──
// ── por sección OSSU, un recurso por curso (solo enlaces https).        ──

export interface ItinerarioOssu {
    title: string; topic: string; summary: string;
    kind: Extract<GuideKind, "itinerario">;
    sections: GuideSection[]; // forma de GuideSection de src/lib/education/study.ts
}

export function itinerarioOssu(): ItinerarioOssu {
    const resumen =
        `Ruta completa del currículo abierto de Ciencias de la Computación de OSSU: ` +
        `${datosOssu.cursos_total} cursos en ${datosOssu.secciones.length} secciones (commit ${versionOssu().commit.slice(0, 7)}). ` +
        `Los cursos son de sus anfitriones con licencias propias, a menudo no comerciales: el OS enlaza, nunca copia ni redistribuye su material.`;

    const porOrden = new Map<number, CursoOssu>(datosOssu.cursos.map((c) => [c.orden, c]));
    const secciones: GuideSection[] = datosOssu.secciones.map((s) => {
        const cursos = s.cursos
            .map((orden) => porOrden.get(orden))
            .filter((c): c is CursoOssu => Boolean(c));
        const temas = s.temas.map((t) => `"${t}"`).join(", ");
        const lista = cursos.map((c) => `${c.nombre} (${c.duracion}, ${c.esfuerzo})`).join(" · ");
        const recursos = cursos.map((c): GuideResource => ({ label: c.nombre, url: c.url, kind: "curso" }));
        return { title: s.seccion, body: `Temas: ${temas}. Cursos: ${lista}.`, resources: recursos };
    });

    return {
        title: "Ruta de Ciencias de la Computación (OSSU)",
        topic: "cat-tecnologia",
        summary: resumen,
        kind: "itinerario",
        sections: secciones,
    };
}
