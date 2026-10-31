import type { SkillCapability } from "@/ai/astraura/skills";
import datos from "../../../../config/educacion-ossu.json";

/**
 * Educación informática · Habilidad de Astraura sobre la ruta abierta de OSSU.
 * Ofrece los cursos en orden (de lo básico a lo avanzado), enlaza al anfitrión
 * original y avisa de que cada curso conserva su licencia. La TARJETA (≤ 60
 * palabras) va a Needle y BitNet; el RESUMEN (≤ 120) a Bonsai pequeño y la ruta
 * COMPLETA al dato de Genesis. Módulo PURO: sin red, disco ni reloj. Nunca copia
 * ni resume el material de un curso como si fuera propio.
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;
export interface HabilidadEducacionInformatica {
  id: string;
  nombre: string;
  cuando: string;
  tarjeta: string;
  resumen: string;
  rutaCompleta: string;
  licencia: "MIT";
  autor: "OSSU";
}
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

export interface CursoSugerido {
  nombre: string;
  anfitrion: string;
  enlace: string;
}

export const ATRIBUCION_EDUCACION_INFORMATICA =
  "Ruta basada en OSSU (ossu/computer-science), licencia MIT; los cursos son de sus anfitriones.";

export const HABILIDAD_EDUCACION_INFORMATICA: HabilidadEducacionInformatica = {
  id: "educacion-informatica",
  nombre: "Educación informática · Ruta OSSU",
  cuando: "Cuando la persona quiere aprender o enseñar informática, programación, sistemas, seguridad, bases de datos, algoritmos o matemáticas para computación.",
  tarjeta:
    "Educación informática con la ruta abierta de OSSU: 63 cursos de computación, de lo básico a lo avanzado. Ofrece la ruta en orden, enlaza siempre al anfitrión original y avisa de que cada curso tiene su propia licencia. Si ya dominas un tema, propón saltarlo. Nunca copies ni resumas el material de un curso como si fuera tuyo.",
  resumen:
    "Educación informática con la ruta abierta de OSSU (ossu/computer-science): 63 cursos en 15 secciones, ordenados de lo básico a lo avanzado, desde Intro CS hasta el proyecto final. Ofrece siempre la ruta en ese orden y enlaza cada curso a su anfitrión original, sin copiar ni resumir su material como si fuera propio: cada curso conserva su licencia, a menudo no comercial, y el MIT cubre solo la lista. Avisa de la licencia al proponer un curso. Si la persona ya domina un tema, propón saltarlo o empezar más adelante, y aprovecha `sugerirRuta` para encontrar cursos afines a lo que pide. Nunca inventes cursos, enlaces ni duraciones: usa el dato de Genesis.",
  rutaCompleta: "config/educacion-ossu.json",
  licencia: "MIT",
  autor: "OSSU",
};

const CURSOS = datos.cursos as CursoOssu[];
const SECCIONES = datos.secciones as SeccionOssu[];
const TEMAS_POR_SECCION = new Map(SECCIONES.map((s) => [s.seccion, s.temas.join(" ")]));
const PALABRAS_VACIAS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "y", "o", "en", "para", "con", "al", "que", "por"]);

/** Minúsculas, sin acentos y con cualquier signo convertido en espacio. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palabras útiles de una consulta: sin vacías ni de una sola letra. */
function palabras(texto: string): string[] {
  return normalizar(texto).split(" ").filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p));
}

export function comoCapacidadEducacion(
  h: HabilidadEducacionInformatica,
  tamano: "tarjeta" | "resumen",
): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

export function sugerirRuta(consulta: string, max = 3): CursoSugerido[] {
  return buscarCursos(consulta, max).map((c) => ({
    nombre: c.nombre,
    anfitrion: c.anfitrion,
    enlace: c.url,
  }));
}

/** Busca cursos por nombre, sección, temas y nodo, como hará `buscarEnOssu` de
 *  `src/lib/education/ossu.ts` (INF1025D); aquí va la versión pura del dato. */
function buscarCursos(consulta: string, max: number): CursoOssu[] {
  const pedidas = palabras(consulta);
  const limite = Math.max(0, Math.trunc(max));
  if (!pedidas.length || !limite) return [];
  return CURSOS.map((curso) => {
    const texto = `${curso.nombre} ${curso.seccion} ${curso.nodo} ${TEMAS_POR_SECCION.get(curso.seccion) ?? ""}`;
    const presentes = new Set(palabras(texto));
    const puntos = pedidas.filter((p) => presentes.has(p)).length;
    return { curso, puntos };
  })
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos || a.curso.orden - b.curso.orden)
    .slice(0, limite)
    .map((x) => x.curso);
}
