import datos from "../../../config/educacion-ossu.json";

export interface CursoOssu {
    orden: number;
    bloque: string;
    seccion: string;
    opcional_a_elegir: boolean;
    nombre: string;
    url: string;
    anfitrion: string;
    alternativas: { nombre: string; url: string }[];
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

export const AVISO_LICENCIA_OSSU = datos.aviso_licencia as string;

export function versionOssu(): { commit: string; fecha: string } {
    return { commit: datos.commit_main as string, fecha: datos.fecha_commit as string };
}

export function seccionesOssu(): SeccionOssu[] {
    return datos.secciones as SeccionOssu[];
}

export function cursosDeNodo(nodoId: string): CursoOssu[] {
    return (datos.cursos as CursoOssu[]).filter((c) => c.nodo === nodoId);
}

export function nodosConOssu(): string[] {
    return Array.from(new Set(seccionesOssu().map((s) => s.nodo)));
}

function normalizarTexto(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
    const q = normalizarTexto(consulta);
    if (!q) return [];
    const secciones = seccionesOssu();
    const todos = datos.cursos as CursoOssu[];
    const puntajes = todos.map((c) => {
        const seccion = secciones.find((s) => s.seccion === c.seccion);
        const textoSeccion = seccion ? seccion.temas.join(" ") + " " + seccion.seccion + " " + (seccion.nodo || "") : "";
        const textoNodo = c.nodo || "";
        const texto = (c.nombre + " " + textoSeccion + " " + textoNodo).toLowerCase();
        const palabras = q.split(/\s+/).filter(Boolean);
        let score = 0;
        for (const w of palabras) {
            if (texto.includes(w)) score += 1;
        }
        return { curso: c, score };
    });
    const filtrados = puntajes
        .filter((p) => p.score > 0)
        .sort((a, b) => b.score - a.score || a.curso.orden - b.curso.orden)
        .map((p) => p.curso);
    return filtrados.slice(0, max);
}

import type { UpsertGuideInput } from "./study";

export function itinerarioOssu(): UpsertGuideInput {
    const secciones = seccionesOssu();
    return {
        title: "Currículo OSSU — Ciencias de la Computación",
        topic: "cat-tecnologia",
        summary: "Itinerario basado en el currículo abierto de OSSU (MIT, Stanford, Harvard, edX, Coursera).",
        kind: "itinerario",
        sections: secciones.map((s) => {
            const cursosSeccion = s.cursos.map((orden) => {
                const c = (datos.cursos as CursoOssu[]).find((curso) => curso.orden === orden);
                if (!c) return null;
                return `"${c.nombre}" (duración: ${c.duracion}, esfuerzo: ${c.esfuerzo})`;
            }).filter(Boolean) as string[];
            return {
                title: s.seccion,
                body: s.temas.map((t) => `"${t}"`).join(", ") + ".\n" + cursosSeccion.join("; ") + ".",
                resources: s.cursos.map((orden) => {
                    const c = (datos.cursos as CursoOssu[]).find((curso) => curso.orden === orden);
                    if (!c) return null;
                    return {
                        label: c.nombre,
                        url: c.url,
                        kind: "curso" as const,
                    };
                }).filter((r): r is { label: string; url: string; kind: "curso" } => !!r && !!r.url && r.url.startsWith("https:")),
            };
        }),
    };
}
