/** Política de actualización por sistema y capa (contrato §4): automática en todas las neuronas,
 * automática solo en una, programada por ventana o manual. Puro: sin React, sin red, sin `node:*`. */
import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export const MODOS_POLITICA: readonly ModoPolitica[] = ["automatica-todas", "automatica-esta", "programada", "manual"];

export const NOMBRE_MODO: Record<ModoPolitica, string> = {
  "automatica-todas": "Automática en todas mis neuronas", "automatica-esta": "Automática solo en esta neurona",
  programada: "Programada", manual: "Manual (avisarme)",
};

export const NOMBRE_MODO_CORTO: Record<ModoPolitica, string> = {
  "automatica-todas": "Auto · todas", "automatica-esta": "Auto · esta", programada: "Programada", manual: "Manual",
};

/** Horas locales: inicio y fin exclusivo; si fin < inicio, la ventana cruza la medianoche. */
export interface VentanaHoraria { desdeH: number; hastaH: number }

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: VentanaHoraria;
  /** Si la capa exige aprobación explícita antes de aplicarse (grupos democráticos). */
  requiereAprobacion?: boolean;
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

/** Tipos de sistema/entidad que reciben versiones (los del diálogo «Crear en la red» y el perfil). */
export type TipoEntidad = "perfil" | "pagina" | "grupo" | "comunidad" | "estudio" | "evento" | "os";

/** Nombres del contrato §4 (se aceptan junto con los del producto: `perfil` ≡ `perfil-privado`). */
export type TipoEntidadContrato = "perfil-privado" | "pagina-publica" | "grupo-jerarquico" | "grupo-democratico";

export type TipoSistema = TipoEntidad | TipoEntidadContrato;

export const NOMBRE_TIPO: Record<TipoEntidad, string> = {
  perfil: "perfil privado", pagina: "página pública", grupo: "grupo", comunidad: "comunidad",
  estudio: "grupo de estudio", evento: "evento", os: "StarSeed OS",
};

export const VENTANA_NOCTURNA: VentanaHoraria = { desdeH: 3, hastaH: 6 };
const P = (modo: ModoPolitica, ventana?: VentanaHoraria): PoliticaCapa => (ventana ? { modo, ventana: { ...ventana } } : { modo });

/** ¿Este tipo de sistema exige aprobación antes de aplicar una versión? */
export function sistemaRequiereAprobacion(tipo: TipoSistema): boolean {
  return tipo === "grupo-democratico";
}

/** Política por defecto (contrato §4): perfil y grupo jerárquico → datos e interfaz automáticas,
 * sw solo en la neurona elegida, el resto avisa; página pública → además el sw va solo;
 * grupo democrático → los mismos modos marcados «requiere aprobación»; OS → modelos nocturnos. */
export function politicaPorDefecto(tipo: TipoSistema): PoliticaSistema {
  const base: PoliticaSistema = {
    datos: P("automatica-todas"), interfaz: P("automatica-todas"), sw: P("automatica-esta"),
    servicios: P("manual"), modelos: P("manual"), nativa: P("manual"),
  };
  if (tipo === "os") return { ...base, modelos: P("programada", VENTANA_NOCTURNA) };
  if (tipo === "pagina" || tipo === "pagina-publica") return { ...base, sw: P("automatica-todas") };
  if (sistemaRequiereAprobacion(tipo)) {
    const out = {} as PoliticaSistema;
    for (const capa of CAPAS_ORDEN) out[capa] = { ...base[capa], requiereAprobacion: true };
    return out;
  }
  return base;
}

/** Hora local, neurona elegida y aprobación (opcionales para no romper llamadores existentes). */
export interface ContextoDecision {
  ahoraH: number; esNeuronaElegida: boolean; aprobada?: boolean; requiereAprobacion?: boolean;
}

export type Decision = "aplicar" | "avisar" | "esperar";

function dentroDeVentana(h: number, v: VentanaHoraria): boolean {
  if (v.desdeH === v.hastaH) return true; // ventana de 24 h
  return v.desdeH < v.hastaH ? h >= v.desdeH && h < v.hastaH : h >= v.desdeH || h < v.hastaH;
}

/** Decisión de una capa en ESTA neurona: sin la aprobación exigida se espera, sea cual sea el modo. */
export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision {
  const requiere = ctx.requiereAprobacion ?? p.requiereAprobacion ?? false;
  if (requiere && ctx.aprobada !== true) return "esperar";
  switch (p.modo) {
    case "automatica-todas": return "aplicar";
    case "automatica-esta": return ctx.esNeuronaElegida ? "aplicar" : "avisar";
    case "programada": return dentroDeVentana(ctx.ahoraH, p.ventana ?? VENTANA_NOCTURNA) ? "aplicar" : "esperar";
    default: return "avisar";
  }
}

const hora = (x: unknown): number | null => (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 23 ? (x as number) : null);

/** Sanea una política que llega del almacenamiento: lo que falte o venga mal queda en manual. */
export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string, unknown> | undefined;
    const modo = c && MODOS_POLITICA.includes(c.modo as ModoPolitica) ? (c.modo as ModoPolitica) : "manual";
    const v = c?.ventana as Record<string, unknown> | undefined;
    const d = hora(v?.desdeH), h = hora(v?.hastaH);
    const limpia = modo === "programada"
      ? P("programada", d !== null && h !== null ? { desdeH: d, hastaH: h } : VENTANA_NOCTURNA)
      : P(modo);
    out[capa] = c?.requiereAprobacion === true ? { ...limpia, requiereAprobacion: true } : limpia;
  }
  return out;
}

/** Texto corto de una política para una ficha («3 capas automáticas · 3 con aviso»). */
export function resumenPolitica(p: PoliticaSistema): string {
  const auto = CAPAS_ORDEN.filter((c) => p[c].modo.startsWith("automatica"));
  const prog = CAPAS_ORDEN.filter((c) => p[c].modo === "programada");
  const man = CAPAS_ORDEN.length - auto.length - prog.length, partes: string[] = [];
  if (auto.length) partes.push(`${auto.length} ${auto.length === 1 ? "capa automática" : "capas automáticas"}`);
  if (prog.length) partes.push(`${prog.length} programada${prog.length === 1 ? "" : "s"}`);
  if (man) partes.push(`${man} con aviso`);
  return partes.join(" · ");
}
