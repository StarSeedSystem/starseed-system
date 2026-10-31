import type { SkillCapability } from "@/ai/astraura/skills";
import { buscarEnOssu } from "@/lib/education/ossu";
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

export const ATRIBUCION_EDUCACION_INFORMATICA =
  "Ruta basada en OSSU (ossu/computer-science), licencia MIT; los cursos son de sus anfitriones.";

export interface HabilidadEducacionInformatica {
  id: string;
  nombre: string;
  /** Cuándo aplica, en una frase. */
  cuando: string;
  /** ≤ 60 palabras, para Needle y BitNet. */
  tarjeta: string;
  /** ≤ 120 palabras, para Bonsai pequeño. */
  resumen: string;
  rutaCompleta: string;
  licencia: "MIT";
  autor: "OSSU";
}

export interface CursoSugerido {
  nombre: string;
  anfitrion: string;
  enlace: string;
}

export const HABILIDAD_EDUCACION_INFORMATICA: HabilidadEducacionInformatica = {
  id: "educacion-informatica",
  nombre: "Educación informática · Ruta OSSU",
  cuando: "Cuando la persona quiere aprender o enseñar informática, programación, sistemas, seguridad, bases de datos, algoritmos o matemáticas para computación.",
  tarjeta:
    "Educación informática con la ruta abierta de OSSU: 63 cursos de computación, de lo básico a lo avanzado. Ofrece la ruta en orden, enlaza siempre al anfitrión original y avisa de que cada curso tiene su propia licencia. Si ya dominas un tema, propón saltarlo. Nunca copies ni resumas el material de un curso como si fuera tuyo.",
  resumen:
    "Educación informática con la ruta abierta de OSSU (ossu/computer-science): 63 cursos en 15 secciones, ordenados de lo básico a lo avanzado, desde Intro CS hasta el proyecto final. Ofrece siempre la ruta en ese orden y enlaza cada curso a su anfitrión original, sin copiar ni resumar su material como si fuera propio: cada curso conserva su licencia, a menudo no comercial, y el MIT cubre solo la lista. Avisa de la licencia al proponer un curso. Si la persona ya domina un tema, propón saltarlo o empezar más adelante, y aprovecha `sugerirRuta` para encontrar cursos afines a lo que pide. Nunca inventes cursos, enlaces ni duraciones: usa el dato de Genesis.",
  rutaCompleta: "config/educacion-ossu.json",
  licencia: "MIT",
  autor: "OSSU",
};

/** Anfitrión de cada curso, mirado en el mismo dato de Genesis por su enlace. */
const ANFITRIONES_POR_ENLACE = new Map(
  datos.cursos.map((c) => [c.url as string, c.anfitrion as string] as const),
);

/** Adapta la habilidad a la forma del registro (`SkillCapability`) con el tamaño pedido. */
export function comoCapacidadEducacion(
  h: HabilidadEducacionInformatica,
  tamano: "tarjeta" | "resumen",
): SkillCapability {
  return { id: h.id, label: h.nombre, systemPrompt: `${h[tamano]} (${h.autor}, ${h.licencia})` };
}

/** Sugerencia de cursos según la consulta, vía `buscarEnOssu` (INF1025D):
 *  nombre del curso, su anfitrión original y el enlace al anfitrión. */
export function sugerirRuta(consulta: string, max = 3): CursoSugerido[] {
  const limite = Math.max(0, Math.trunc(max));
  if (!limite) return [];
  return buscarEnOssu(consulta, limite)
    .map((c) => ({
      nombre: c.nombre,
      anfitrion: ANFITRIONES_POR_ENLACE.get(c.url) ?? "",
      enlace: c.url,
    }))
    .filter((c) => c.anfitrion.length > 0);
}
