/*
 * ossu — Currículo abierto de Ciencias de la Computación (OSSU) como datos para Educación.
 * Fuente: config/educacion-ossu.json (repos. ossu/computer-science, licencia MIT). Módulo
 * PURO: sin red, sin disco, sin reloj. El MIT cubre la lista; los cursos son de sus
 * anfitriones con licencias propias: el OS enlaza, nunca copia ni redistribuye su material.
 */

import datos from "../../../config/educacion-ossu.json";
import type { UpsertGuideInput } from "./study";

export interface CursoOssu {
    orden: number;
    bloque: string;
    seccion: string;
    opcional_a_elegir: boolean;
    nombre: string;
    url: string;
    anfitrion: string;
    duracion: string;
    esfuerzo: string;
    requisitos: string;
    nodo: string;
}

export interface SeccionOssu {
    seccion: string;
    bloque: string;
    temas: string[];
    cursos: number[];
    nodo: string;
}

interface DatosOssu {
    aviso_licencia: string;
    commit_main: string;
    fecha_commit: string;
    secciones: SeccionOssu[];
    cursos: CursoOssu[];
}

const d = datos as unknown as DatosOssu;

/** Aviso visible de licencia: el MIT cubre la lista; cada curso lo suyo. */
export const AVISO_LICENCIA_OSSU: string = d.aviso_licencia;

/** Versión del dato: commit de main y su fecha. */
export function versionOssu(): { commit: string; fecha: string } {
    return { commit: d.commit_main, fecha: d.fecha_commit };
}
export function seccionesOssu(): SeccionOssu[] {
    return d.secciones;
}

/** Cursos asignados a un nodo del catálogo de Educación, en orden del currículo. */
export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return d.cursos.filter((c) => c.nodo === nodoId).sort((a, b) => a.orden - b.orden);
}

/** Nodos del catálogo con al menos un curso OSSU, en orden de aparición. */
export function nodosConOssu(): string[] {
    const vistos: string[] = [];
    for (const c of d.cursos) if (!vistos.includes(c.nodo)) vistos.push(c.nodo);
    return vistos;
}

/** Sin acentos ni mayúsculas: «Seguridad» == «seguridad» == «seguridad-informatica». */
function tokens(texto: string): string[] {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * Búsqueda por palabras en el nombre del curso y en los temas y nodo de su sección
 * (los temas están en inglés; los ids del catálogo permiten buscar «seguridad» o
 * «algoritmos» en español). Gana el curso con más coincidencias; después, su orden.
 */
export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = tokens(consulta);
    if (palabras.length === 0) return [];
    const temasPorSeccion = new Map(d.secciones.map((s) => [s.seccion, s.temas]));
    const vocabularioDe = (c: CursoOssu): Set<string> => {
        const v = new Set<string>(tokens(c.nombre));
        for (const t of temasPorSeccion.get(c.seccion) ?? []) for (const tk of tokens(t)) v.add(tk);
        for (const tk of tokens(c.seccion)) v.add(tk);
        for (const tk of tokens(c.nodo)) v.add(tk);
        return v;
    };
    return d.cursos
        .map((c) => {
            const v = vocabularioDe(c);
            return { c, puntos: palabras.filter((p) => v.has(p)).length };
        })
        .filter((r) => r.puntos > 0)
        .sort((a, b) => b.puntos - a.puntos || a.c.orden - b.c.orden)
        .slice(0, Math.max(0, max))
        .map((r) => r.c);
}

/** Itinerario compatible con `UpsertGuideInput` (study.ts): una sección por sección OSSU. */
export function itinerarioOssu(): UpsertGuideInput {
    const porOrden = new Map(d.cursos.map((c) => [c.orden, c]));
    const secciones = d.secciones.map((s) => {
        const cursos = s.cursos.map((o) => porOrden.get(o)).filter((c): c is CursoOssu => !!c).sort((a, b) => a.orden - b.orden);
        const partes: string[] = [];
        if (s.temas.length > 0) partes.push(`Temas: ${s.temas.map((t) => `"${t}"`).join(", ")}`);
        for (const c of cursos) partes.push(`- ${c.nombre} (${c.duracion}, ${c.esfuerzo})`);
        return {
            title: s.seccion,
            body: partes.join("\n"),
            resources: cursos.filter((c) => c.url.startsWith("https://")).map((c) => ({ label: c.nombre, url: c.url, kind: "curso" })),
        };
    });
    return {
        title: "Ruta de Ciencias de la Computación (OSSU)",
        topic: "top-programacion",
        summary:
            "Los 63 cursos del currículo abierto de Ciencias de la Computación de la Open Source Society University (OSSU), una sección por nivel: intro, núcleo, avanzado y proyecto final.",
        kind: "itinerario",
        sections: secciones,
    };
}
