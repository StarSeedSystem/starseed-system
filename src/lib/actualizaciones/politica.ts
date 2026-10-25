/**
 * Política de actualización por sistema y por capa (contrato §4).
 * ═══════════════════════════════════════════════════════════════
 * Quien recibe una versión decide CÓMO le llega, capa por capa: automática en todas sus neuronas,
 * automática solo en una, programada en una ventana horaria o manual (avisar). Al crear un perfil,
 * una página, un grupo o una comunidad se propone la política por defecto de su tipo; luego se
 * cambia en su Genesis.
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export const MODOS_POLITICA: readonly ModoPolitica[] = ["automatica-todas", "automatica-esta", "programada", "manual"];

export const NOMBRE_MODO: Record<ModoPolitica, string> = {
  "automatica-todas": "Automática en todas mis neuronas",
  "automatica-esta": "Automática solo en esta neurona",
  programada: "Programada",
  manual: "Manual (avisarme)",
};

export const NOMBRE_MODO_CORTO: Record<ModoPolitica, string> = {
  "automatica-todas": "Auto · todas",
  "automatica-esta": "Auto · esta",
  programada: "Programada",
  manual: "Manual",
};

export interface VentanaHoraria {
  /** Hora local de inicio (0-23). */
  desdeH: number;
  /** Hora local de fin, exclusiva (0-23). Si es menor que `desdeH`, la ventana cruza la medianoche. */
  hastaH: number;
}

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: VentanaHoraria;
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

/**
 * Tipos de sistema/entidad que reciben versiones. Los nombres cortos son los del diálogo «Crear
 * en la red» y las pantallas; los del contrato (§4) describen la misma cosa con más precisión y
 * se aceptan para que una política guardada con ellos no pierda el modo democrático.
 */
export type TipoEntidad =
  | "perfil"
  | "pagina"
  | "grupo"
  | "comunidad"
  | "estudio"
  | "evento"
  | "os"
  | "perfil-privado"
  | "pagina-publica"
  | "grupo-jerarquico"
  | "grupo-democratico";

export const NOMBRE_TIPO: Record<TipoEntidad, string> = {
  perfil: "perfil privado",
  pagina: "página pública",
  grupo: "grupo",
  comunidad: "comunidad",
  estudio: "grupo de estudio",
  evento: "evento",
  os: "StarSeed OS",
  "perfil-privado": "perfil privado",
  "pagina-publica": "página pública",
  "grupo-jerarquico": "grupo jerárquico",
  "grupo-democratico": "grupo democrático",
};

export const VENTANA_NOCTURNA: VentanaHoraria = { desdeH: 3, hastaH: 6 };

const P = (modo: ModoPolitica, ventana?: VentanaHoraria): PoliticaCapa => (ventana ? { modo, ventana: { ...ventana } } : { modo });

/**
 * Política por defecto según el tipo (contrato §4):
 *   · perfil privado (o grupo jerárquico) → datos e interfaz automáticas; el resto avisa;
 *   · página pública → lo declarativo (datos, interfaz y sin conexión) sigue la rama estable;
 *   · el OS → igual que un perfil, pero los modelos (descargas grandes) en la ventana nocturna.
 * Un grupo democrático usa la misma política que un perfil, pero `requiereAprobacionPrevia`
 * marca que nada se aplica hasta que la votación lo apruebe: lo ya aprobado llega automático
 * a quien lo tenga así.
 */
export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema {
  const base: PoliticaSistema = {
    datos: P("automatica-todas"),
    interfaz: P("automatica-todas"),
    sw: P("automatica-esta"),
    servicios: P("manual"),
    modelos: P("manual"),
    nativa: P("manual"),
  };
  if (tipo === "pagina" || tipo === "pagina-publica") return { ...base, sw: P("automatica-todas") };
  if (tipo === "os") return { ...base, modelos: P("programada", VENTANA_NOCTURNA) };
  return base;
}

/** ¿Este tipo exige aprobación previa (votación del grupo) antes de aplicar una versión? */
export function requiereAprobacionPrevia(tipo: TipoEntidad): boolean {
  return tipo === "grupo-democratico";
}

export interface ContextoDecision {
  /** Hora local actual (0-23). */
  ahoraH: number;
  /** Esta neurona es la elegida para «automática solo en esta neurona». */
  esNeuronaElegida: boolean;
  /** La versión ya se aprobó (votación o permiso de quien gobierna). */
  aprobada?: boolean;
  /** Esta capa exige aprobación previa (p. ej. los sistemas de un grupo democrático). */
  requiereAprobacion?: boolean;
}

export type Decision = "aplicar" | "avisar" | "esperar";

function dentroDeVentana(h: number, v: VentanaHoraria): boolean {
  if (v.desdeH === v.hastaH) return true; // ventana de 24 h
  return v.desdeH < v.hastaH ? h >= v.desdeH && h < v.hastaH : h >= v.desdeH || h < v.hastaH;
}

/** Qué hacer con una capa pendiente en ESTA neurona según su política. */
export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision {
  // Sin aprobación previa no importa el modo: jamás se aplica (ni se avisa como «lista»).
  if (ctx.requiereAprobacion && ctx.aprobada !== true) return "esperar";
  switch (p.modo) {
    case "automatica-todas":
      return "aplicar";
    case "automatica-esta":
      return ctx.esNeuronaElegida ? "aplicar" : "avisar";
    case "programada":
      return dentroDeVentana(ctx.ahoraH, p.ventana ?? VENTANA_NOCTURNA) ? "aplicar" : "esperar";
    default:
      return "avisar";
  }
}

const hora = (x: unknown): number | null => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 23 ? (x as number) : null);

/**
 * Sanea una política que llega del almacenamiento: un modo ausente o desconocido queda en
 * manual y una programada sin ventana válida cae en la nocturna. Nunca lanza.
 */
export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string, unknown> | undefined;
    const modo = c && MODOS_POLITICA.includes(c.modo as ModoPolitica) ? (c.modo as ModoPolitica) : "manual";
    if (modo === "programada") {
      const v = c?.ventana as Record<string, unknown> | undefined;
      const d = hora(v?.desdeH);
      const h = hora(v?.hastaH);
      out[capa] = P("programada", d !== null && h !== null ? { desdeH: d, hastaH: h } : VENTANA_NOCTURNA);
    } else out[capa] = P(modo);
  }
  return out;
}

/** Texto corto de una política para una ficha («Datos e interfaz automáticas; el resto, avisar»). */
export function resumenPolitica(p: PoliticaSistema): string {
  const auto = CAPAS_ORDEN.filter((c) => p[c].modo === "automatica-todas" || p[c].modo === "automatica-esta");
  const prog = CAPAS_ORDEN.filter((c) => p[c].modo === "programada");
  const partes: string[] = [];
  if (auto.length) partes.push(`${auto.length} ${auto.length === 1 ? "capa automática" : "capas automáticas"}`);
  if (prog.length) partes.push(`${prog.length} programada${prog.length === 1 ? "" : "s"}`);
  const man = CAPAS_ORDEN.length - auto.length - prog.length;
  if (man) partes.push(`${man} con aviso`);
  return partes.join(" · ");
}
