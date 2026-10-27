/*
 * ossu — Currículo OSSU (computer-science) como datos, para el Módulo Educación.
 * El dato vive en `config/educacion-ossu.json` (copia de `datos/ossu-cs.json` del
 * grupo «infra», Ola 1025R). Licencia MIT: cubre la lista; los cursos son de sus
 * anfitriones, con licencias propias — el OS enlaza, nunca copia ni redistribuye.
 * Módulo puro: sin red, disco ni reloj.
 */

import datos from "../../../config/educacion-ossu.json";
import type { UpsertGuideInput } from "@/lib/education/study";

export interface CursoOssu {
    orden: number;
    seccion: string;
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
    cursos: CursoOssu[];
    nodo: string;
}

export const AVISO_LICENCIA_OSSU: string = datos.aviso_licencia;

export function versionOssu(): { commit: string; fecha: string } {
    return { commit: datos.commit_main, fecha: datos.fecha_commit };
}

export function seccionesOssu(): SeccionOssu[] {
    const bruto = datos.cursos as CursoOssu[];
    return datos.secciones.map((s) => ({
        seccion: s.seccion,
        bloque: s.bloque,
        temas: [...s.temas],
        nodo: s.nodo,
        cursos: bruto
            .filter((c) => c.seccion === s.seccion)
            .sort((a, b) => a.orden - b.orden),
    }));
}

export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return (datos.cursos as CursoOssu[]).filter((c) => c.nodo === nodoId);
}

export function nodosConOssu(): string[] {
    const vistos = new Set<string>();
    for (const s of datos.secciones) vistos.add(s.nodo);
    for (const c of datos.cursos as CursoOssu[]) vistos.add(c.nodo);
    return [...vistos];
}

function quitaAcentos(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/** Búsqueda por palabras completas en nombre de curso, temas de su sección, sección y nodo (el nodo es el id en español), sin acentos ni mayúsculas. */
export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const palabras = quitaAcentos(consulta).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return [];
    const secciones = seccionesOssu();
    const puntuado: { curso: CursoOssu; puntos: number }[] = [];
    for (const c of datos.cursos as CursoOssu[]) {
        const sec = secciones.find((s) => s.seccion === c.seccion);
        const nombre = quitaAcentos(c.nombre);
        const temas = [
            ...(sec?.temas ?? []),
            sec?.seccion ?? "",
            c.nodo,
        ].map(quitaAcentos).join(" ");
        const puntos = palabras.reduce(
            (acc, p) => acc + (nombre.includes(p) ? 2 : 0) + (temas.includes(p) ? 1 : 0),
            0,
        );
        if (puntos > 0) puntuado.push({ curso: c, puntos });
    }
    puntuado.sort((a, b) => b.puntos - a.puntos || a.curso.orden - b.curso.orden);
    return puntuado.slice(0, Math.max(1, max)).map((p) => p.curso);
}

/** Itinerario completo OSSU, compatible con UpsertGuideInput de study.ts. Sólo enlaces https:. */
export function itinerarioOssu(): UpsertGuideInput {
    const secciones = seccionesOssu();
    return {
        title: "Itinerario OSSU · Ciencias de la Computación",
        topic: "top-programacion",
        summary: "Currículo OSSU (computer-science) como itinerario de estudio; creado a partir del dato, sin copiar su material.",
        kind: "itinerario",
        sections: secciones.map((s) => ({
            title: s.bloque,
            body: [
                s.temas.map((t) => `"${t}"`).join(", "),
                ...s.cursos.map(
                    (c) => `${c.nombre} — ${c.duracion}, ${c.esfuerzo} (${c.anfitrion}).`,
                ),
            ].join("\n"),
            resources: s.cursos
                .filter((c) => c.url.startsWith("https:"))
                .map((c) => ({ label: c.nombre, url: c.url, kind: "curso" as const })),
        })),
    };
}
