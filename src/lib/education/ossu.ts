// src/lib/education/ossu.ts
// -----------------------------------------------------------------------------
// Educación · OSSU (Ola 1025R, INF1025D/E)
// -----------------------------------------------------------------------------
// Currículo abierto de Ciencias de la Computación de OSSU (ossu/computer-science,
// licencia MIT en su texto). Los datos viven en `config/educacion-ossu.json`
// (la única copia: aquí solo se leen y se transforman, puros y sin red, disco
// ni reloj). El OS ENLAZA a cada curso en su anfitrión: nunca copia ni
// redistribuye su material.
// -----------------------------------------------------------------------------

import datosOssu from "../../../config/educacion-ossu.json";
import type { GuideSection, UpsertGuideInput } from "@/lib/education/study";

/** Un curso de la lista de OSSU, normalizado para la interfaz. */
export interface OssuCurso {
    orden: number;
    bloque: string;
    seccion: string;
    nombre: string;
    url: string;
    anfitrion: string;
    duracion: string;
    esfuerzo: string;
    requisitos: string;
    /** En OSSU es «elige una de estas»: se marca en la interfaz. */
    opcional: boolean;
}

/** Una de las 15 secciones del currículo, con su bloque. */
export interface OssuSeccion {
    seccion: string;
    bloque: string;
}

type DatosOssuJson = {
    aviso_licencia: string;
    commit_main: string;
    fecha_commit: string;
    cursos_total: number;
    secciones: OssuSeccion[];
    cursos: {
        orden: number; bloque: string; seccion: string;
        opcional_a_elegir: boolean; nombre: string; url: string; anfitrion: string;
        duracion: string; esfuerzo: string; requisitos: string;
    }[];
};

const datos = datosOssu as unknown as DatosOssuJson;

/** Aviso de licencia, visible en la interfaz: el MIT cubre la lista, no el material de los cursos. */
export const AVISO_LICENCIA_OSSU: string = datos.aviso_licencia;

/** Versión de la lista: commit corto de `main` y su fecha (canal correcto frente a etiqueta v8 de 2017). */
export function versionOssu(): { commit: string; fecha: string } {
    return { commit: datos.commit_main.slice(0, 7), fecha: datos.fecha_commit };
}

/** El contador oficial de cursos (63). */
export function contadorCursosOssu(): number {
    return datos.cursos_total;
}

/** Los 15 secciones del currículo, en el orden del documento, con su bloque. */
export function seccionesOssu(): OssuSeccion[] {
    return datos.secciones.map((s) => ({ seccion: s.seccion, bloque: s.bloque }));
}

/** Bloques únicos, en orden de aparición: Intro CS, Core CS, Advanced CS, Final project. */
export function bloquesOssu(): string[] {
    const bloques: string[] = [];
    for (const s of seccionesOssu()) if (!bloques.includes(s.bloque)) bloques.push(s.bloque);
    return bloques;
}

/** Los 63 cursos, normalizados y en orden. */
export function cursosOssu(): OssuCurso[] {
    return datos.cursos
        .slice()
        .sort((a, b) => a.orden - b.orden)
        .map((c) => ({
            orden: c.orden, bloque: c.bloque, seccion: c.seccion, nombre: c.nombre,
            url: c.url, anfitrion: c.anfitrion, duracion: c.duracion, esfuerzo: c.esfuerzo,
            requisitos: c.requisitos, opcional: c.opcional_a_elegir,
        }));
}

/** Los cursos de una sección concretada, en orden. */
export function cursosDeSeccion(seccion: string): OssuCurso[] {
    return cursosOssu().filter((c) => c.seccion === seccion);
}

/** Itinerario listo para `createGuide` (guía de tipo «itinerario»). */
export function itinerarioOssu(): UpsertGuideInput {
    const secciones: GuideSection[] = seccionesOssu().map((s, i) => ({
        title: `${i + 1}. ${s.seccion} (${s.bloque})`,
        body: "Enlaces a los cursos de OSSU en su anfitrión; cada uno trae su duración y esfuerzo. No se copia material de terceros.",
        resources: cursosDeSeccion(s.seccion).map((c) => ({
            label: c.nombre + (c.opcional ? " (elegir una)" : ""),
            url: c.url,
            kind: "curso",
        })),
    }));
    return {
        title: "Ruta de Ciencias de la Computación (OSSU)",
        kind: "itinerario",
        topic: "Informática",
        summary: `Itinerario creado desde la ruta de OSSU (${contadorCursosOssu()} cursos, ${seccionesOssu().length} secciones). ` + AVISO_LICENCIA_OSSU,
        sections: secciones,
    };
}
