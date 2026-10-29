/*
 * ossu — Dato del currículo abierto de Ciencias de la Computación de OSSU
 * (config/educacion-ossu.json, generado del README de ossu/computer-science).
 * ---------------------------------------------------------------------------
 * Es una LISTA DE ENLACES: el MIT cubre la lista y su orden; los cursos
 * enlazados son de sus anfitriones con licencias propias. El OS enlaza y
 * nunca copia ni redistribuye su material (aviso: AVISO_LICENCIA_OSSU).
 *
 * Módulo puro: sin red, disco ni reloj. La copia del dato la trae el
 * integrador de la ola 1025R; actualizarlo es regenerar el JSON y revisarlo
 * a mano, nunca aplicar solo.
 */

import datos from "../../../config/educacion-ossu.json";
import type { UpsertGuideInput } from "./study";

// ───────────────────────────── Tipos ──────────────────────────────────────

export interface AlternativaOssu {
    nombre?: string;
    url: string;
}

export interface CursoOssu {
    orden: number;
    bloque: string;
    seccion: string;
    opcional_a_elegir: boolean;
    nombre: string;
    url: string;
    anfitrion: string;
    alternativas: AlternativaOssu[];
    duracion: string;
    esfuerzo: string;
    requisitos: string;
    /** Nodo del catálogo de Educación (src/lib/education/curriculum.ts). */
    nodo: string;
}

export interface SeccionOssu {
    seccion: string;
    bloque: string;
    temas: string[];
    cursos: number[];
    nodo: string;
}

// ─────────────────────────── Aviso y versión ──────────────────────────────

/** Copia fiel del aviso de licencia del dato: el OS enlaza, no redistribuye. */
export const AVISO_LICENCIA_OSSU: string = datos.aviso_licencia;

/** Commit de main y fecha del README del que se generó el dato (trazabilidad). */
export function versionOssu(): { commit: string; fecha: string } {
    return { commit: datos.commit_main, fecha: datos.fecha_commit };
}

// ───────────────────────────── Lectura ────────────────────────────────────

export function seccionesOssu(): SeccionOssu[] {
    return datos.secciones;
}

/** Cursos del nodo de Educación dado, en el orden del currículo. */
export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return datos.cursos.filter((c) => c.nodo === nodoId).sort((a, b) => a.orden - b.orden);
}

/** Ids de nodos del catálogo que tienen al menos un curso OSSU, por orden de aparición. */
export function nodosConOssu(): string[] {
    const vistos: string[] = [];
    for (const c of datos.cursos) if (!vistos.includes(c.nodo)) vistos.push(c.nodo);
    return vistos;
}

// ───────────────────────────── Búsqueda ───────────────────────────────────

function norm(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Coincidencia por palabras en nombre, sección, nodo y temas (sin acentos ni mayúsculas). */
export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = norm(consulta).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [];
    const temasPorSeccion = new Map<string, string[]>(
        datos.secciones.map((s) => [s.seccion, s.temas]),
    );
    const conPalabras = datos.cursos.filter((c) => {
        const pozo = norm(
            [c.nombre, c.seccion, c.nodo, ...(temasPorSeccion.get(c.seccion) ?? [])].join(" "),
        );
        return palabras.every((p) => pozo.includes(p));
    });
    return conPalabras.sort((a, b) => a.orden - b.orden).slice(0, max);
}

// ──────────────────────────── Itinerario ──────────────────────────────────

/** Solo enlaces https: sale como recurso; algo distinto (no hay nada en el dato) no se enlaza. */
function recursoCurso(c: CursoOssu): UpsertGuideInput["sections"][number]["resources"][number] | null {
    if (!c.url.startsWith("https:")) return null;
    return { label: c.nombre, url: c.url, kind: "curso" };
}

function cuerpoSeccion(s: SeccionOssu, cursos: CursoOssu[]): string {
    const lineas: string[] = [];
    if (s.temas.length > 0) {
        lineas.push(`Temas: ${s.temas.map((t) => `"${t}"`).join(", ")}.`);
        lineas.push("");
    }
    lineas.push("Cursos:");
    for (const c of cursos) {
        const partes = [c.duracion, c.esfuerzo].filter((p) => p && p !== "-");
        lineas.push(partes.length > 0 ? `· ${c.nombre} — ${partes.join(" · ")}` : `· ${c.nombre}`);
    }
    return lineas.join("\n");
}

/** Un itinerario (guía kind="itinerario") con una sección por sección OSSU y un recurso por curso. */
export function itinerarioOssu(): UpsertGuideInput {
    return {
        title: "Ruta de Ciencias de la Computación (OSSU)",
        topic: "Ciencias de la Computación",
        summary:
            `Currículo abierto de grado de OSSU: ${datos.cursos.length} cursos en ` +
            `${datos.secciones.length} secciones. ${AVISO_LICENCIA_OSSU}`,
        kind: "itinerario",
        sections: datos.secciones.map((s) => {
            const cursos = datos.cursos
                .filter((c) => c.seccion === s.seccion)
                .sort((a, b) => a.orden - b.orden);
            const resources = cursos
                .map(recursoCurso)
                .filter((r) => r !== null);
            return { title: s.seccion, body: cuerpoSeccion(s, cursos), resources };
        }),
    };
}

