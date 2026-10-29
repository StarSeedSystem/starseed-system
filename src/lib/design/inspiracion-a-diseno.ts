// inspiracion-a-diseno.ts — RFI1018G · de referencia a diseño propio.
// Módulo PURO: sin red, sin disco, sin reloj. De una tarjeta de referencias
// sale un brief con patrones en palabras propias y nombres nuevos, nunca copias.
import { CURVA, DURACION } from "@/lib/design/movimiento";

export type ObjetivoDiseno =
  | "menu" | "boton" | "transicion" | "animacion" | "seccion"
  | "pagina" | "marca" | "escena3d" | "xr";
export type ClaseUso = "reutilizable" | "reutilizable-con-condiciones" | "solo-referencia" | "solo-enlace";

/** Tarjeta de la herramienta F, enriquecida con lo que hace falta para el brief. */
export interface ReferenciaInspiracion {
  entradaId: string;
  nombre?: string;
  tema?: string;
  subtema?: string | null;
  tipo?: string;
  claseUso?: ClaseUso;
  url?: string;
  canalUsado?: string;
  queEs?: string;
  condiciones?: string;
  prohibido?: readonly string[];
  textos?: readonly string[];
  textoFuente?: string;
  enlaces?: readonly { titulo: string; url: string }[];
}

export interface EntradaBrief {
  referencias: readonly ReferenciaInspiracion[];
  objetivo: ObjetivoDiseno;
  contexto: string;
  adn?: string | readonly string[] | { claves?: readonly string[]; tema?: string; movimiento?: string };
  principios?: string | readonly string[];
  movimientoReducido?: boolean;
}

export interface PatronesBrief {
  estructura: string;
  jerarquia: string;
  ritmo: string;
  tipografia: string;
  movimiento: { duracionMs: number; curva: string; resorte: { rigidez: number; amortiguacion: number } };
}

export interface BriefDiseno {
  titulo: string;
  objetivo: ObjetivoDiseno;
  contexto: string;
  patrones: PatronesBrief;
  tokens: Record<string, string>;
  nombres: string[];
  adn: string[];
  principios: string[];
  creditos: string[];
  restricciones: string[];
  resumen: string;
}

export interface ResultadoValidacion {
  ok: boolean;
  motivos: string[];
}

export function briefDesdeReferencias(entrada: EntradaBrief): BriefDiseno {
  throw new Error("pendiente");
}

export function validarResultado(markup: unknown, referencias: readonly ReferenciaInspiracion[] = []): ResultadoValidacion {
  void markup;
  void referencias;
  return { ok: false, motivos: [] };
}
