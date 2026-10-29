/**
 * INSPIRACIÓN A DISEÑO — de la referencia externa al diseño propio (RFI1018G).
 * Módulo PURO: de las tarjetas de referencias (contrato F de la ola 1018R) sale
 * un BRIEF para el Director de diseño con los PATRONES en palabras propias —
 * estructura, jerarquía, ritmo, movimiento (duración, curva, resorte) y
 * emparejamiento tipográfico —, un nombre nuevo, tokens del tema del contexto
 * y la lista de créditos. La referencia se cita; jamás se copia:
 * `validarResultado` rechaza textos ajenos de más de 8 palabras seguidas,
 * logos y URLs de assets de terceros dentro del html/tsx recibido.
 */

import { CURVA, DURACION } from "@/lib/design/movimiento";
import type { PrincipioUsabilidad } from "@/lib/design/principios-referencia";
import type { RegistroMovimiento } from "@/lib/design/registros-movimiento";

/** Tarjeta de referencia que la herramienta de búsqueda entrega al estudio. */
export interface TarjetaReferencia {
    id: string;
    nombre: string;
    queEs?: string;
    url?: string;
    tema?: string;
    claseUso?: string;
}

export type ObjetivoDiseno = "menu" | "boton" | "transicion" | "animacion" | "seccion" | "pagina" | "marca" | "escena3d" | "xr";

export interface AdnDiseno { registroMovimiento?: unknown; fuentes?: string[]; tokens?: Record<string, string> }

/** Petición del estudio: tarjetas, objetivo, contexto, ADN y principios (C). */
export interface EntradaBrief {
    referencias: readonly TarjetaReferencia[];
    objetivo: ObjetivoDiseno;
    contexto?: string;
    adn?: AdnDiseno;
    principios?: readonly PrincipioUsabilidad[];
}

/** El brief completo que recibe el Director de diseño. */
export interface BriefDiseno {
    nombre: string;
    objetivo: ObjetivoDiseno;
    contexto: string;
    registro: RegistroMovimiento;
    patron: { estructura: string; jerarquia: string; ritmo: string };
    movimiento: { duracionMs: number; curva: string; resorte: boolean };
    emparejamientoTipografico: string[];
    tokens: { clave: string; valor: string }[];
    principios: string[];
    creditos: { nombre: string; url?: string; claseUso?: string }[];
    nota: string;
}

/** Veredicto sobre el resultado (html o tsx): los motivos son ids de regla. */
export interface VerificacionResultado { valido: boolean; motivos: string[] }

export function briefDesdeReferencias(entrada: EntradaBrief): BriefDiseno {
    throw new Error("sin completar");
}

/** Palabras en minúscula, sin signos, para comparar tramos de seguido. */
function palabras(texto: string): string[] {
    return texto.toLowerCase().split(/[^a-záéíóúüñ0-9]+/).filter(Boolean);
}

export function validarResultado(codigo: string, referencias: readonly TarjetaReferencia[]): VerificacionResultado {
    throw new Error("sin completar");
}
