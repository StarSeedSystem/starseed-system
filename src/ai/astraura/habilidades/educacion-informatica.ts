import type { SkillCapability } from "@/ai/astraura/skills";
import { buscarEnOssu } from "@/lib/education/ossu";
import datos from "../../../../config/educacion-ossu.json";

/**
 * Educación informática · Habilidad de Astraura sobre la ruta abierta de OSSU.
 * Usa `buscarEnOssu` (src/lib/education/ossu.ts, INF1025D) para hallar cursos en
 * el dato único `config/educacion-ossu.json` y ofrece la ruta en orden (de lo
 * básico a lo avanzado), enlazando SIEMPRE al anfitrión original y avisando de
 * que cada curso tiene su propia licencia. Si la persona ya domina un tema,
 * propón saltarlo. Nunca copia ni resume el material de un curso como si fuera
 * propio. Módulo PURO: sin red, disco ni reloj.
 */

export const MAX_PALABRAS_TARJETA = 60;
export const MAX_PALABRAS_RESUMEN = 120;

export interface HabilidadEducacionInformatica {
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  tarjeta: string;
  /** ≤ 120 palabras, para Bonsai pequeño. */
  resumen: string;
  /** Ruta del dato de OSSU, relativa a la raíz del repositorio. */
  rutaCompleta: string;
  licencia: "MIT";
  autor: "OSSU";
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
    "Educación informática con la ruta abierta de OSSU: 63 cursos de computación, de lo básico a lo avanzado. Ofrece la ruta en orden, enlaza siempre al anfitrión original y avisa de que cada curso tiene su propia licencia. Si ya domina un tema, propón saltarlo. Nunca copies ni resumas el material de un curso como si fuera tuyo.",
  resumen:
    "Educación informática con la ruta abierta de OSSU (ossu/computer-science): 63 cursos en 15 secciones, ordenados de lo básico a lo avanzado, desde Intro CS hasta el proyecto final. Ofrece siempre la ruta en ese orden y enlaza cada curso a su anfitrión original, sin copiar ni resumir su material como si fuera propio: cada curso conserva su licencia, a menudo no comercial, y el MIT cubre solo la lista. Avisa de la licencia al proponer un curso. Si la persona ya domina un tema, propón saltarlo o empezar más adelante, y usa buscarEnOssu para encontrar cursos afines a lo que pide. Nunca inventes cursos, enlaces ni duraciones: usa el dato de Genesis.",
  rutaCompleta: "config/educacion-ossu.json",
  licencia: "MIT",
  autor: "OSSU",
};

/** Anfitrión de cada curso, por su enlace único: `buscarEnOssu` no lo expone. */
const ANFITRION_POR_ENLACE = new Map(
  (datos.cursos as { url: string; anfitrion: string }[]).map((c) => [c.url, c.anfitrion]),
);

export function comoCapacidadEducacion(
  h: HabilidadEducacionInformatica,
  tamano: "tarjeta" | "resumen",
): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

/** Cursos afines a la consulta (≤ `max`, 3 por defecto), con nombre, anfitrión
 *  y enlace del anfitrión original. Vacío si no hay coincidencia o `max ≤ 0`. */
export function sugerirRuta(consulta: string, max = 3): CursoSugerido[] {
  const limite = Math.max(0, Math.trunc(max));
  if (!limite) return [];
  return buscarEnOssu(consulta, limite).map((c) => ({
    nombre: c.nombre,
    anfitrion: ANFITRION_POR_ENLACE.get(c.url) ?? "",
    enlace: c.url,
  }));
}
