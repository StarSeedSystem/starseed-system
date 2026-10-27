import datos from "../../../config/educacion-ossu.json";
import type { UpsertGuideInput } from "@/lib/education/study";

export type CursoOssu = {
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
};

export type SeccionOssu = {
  seccion: string;
  bloque: string;
  temas: string[];
  cursos: number[];
  nodo: string;
};

const DATA = datos as {
  aviso_licencia: string;
  commit_main: string;
  fecha_commit: string;
  secciones: SeccionOssu[];
  cursos: CursoOssu[];
};

export const AVISO_LICENCIA_OSSU = DATA.aviso_licencia;

export function versionOssu() {
  return { commit: DATA.commit_main, fecha: DATA.fecha_commit };
}

export function seccionesOssu(): SeccionOssu[] {
  return DATA.secciones;
}

export function cursosDeNodo(nodoId: string): CursoOssu[] {
  return DATA.cursos.filter(c => c.nodo === nodoId);
}

export function nodosConOssu(): string[] {
  return Array.from(new Set(DATA.cursos.map(c => c.nodo)));
}

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function buscarEnOssu(consulta: string, max = 5): CursoOssu[] {
  const q = normalize(consulta);
  if (!q) return [];
  const resultados: CursoOssu[] = [];
  for (const c of DATA.cursos) {
    const seccion = DATA.secciones.find(s => s.seccion === c.seccion);
    const temas = seccion?.temas.join(" ") ?? "";
    if (normalize(c.nombre).includes(q) || normalize(temas).includes(q)) {
      resultados.push(c);
      if (resultados.length >= max) break;
    }
  }
  return resultados;
}

export function itinerarioOssu(): UpsertGuideInput {
  const sections = DATA.secciones.map(sec => {
    const cursos = sec.cursos.map(id => DATA.cursos.find(c => c.orden === id)).filter(Boolean) as CursoOssu[];
    const temasList = sec.temas.map(t => `"${t}"`).join(", ");
    const cursosText = cursos.map(c => `• ${c.nombre} — Duración: ${c.duracion}, Esfuerzo: ${c.esfuerzo}`).join("\n");
    const body = `Temas: ${temasList}\n\nCursos:\n${cursosText}`;
    const resources = cursos.map(c => ({ label: c.nombre, url: c.url, kind: "curso" as const }));
    return { title: sec.seccion, body, resources };
  });
  return {
    title: "Itinerario OSSU Ciencias de la Computación",
    topic: "cat-tecnologia",
    summary: "Itinerario basado en OSSU Computer Science.",
    kind: "itinerario",
    sections,
  };
}
