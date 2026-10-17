import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: { desdeH: number; hastaH: number };
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

export type TipoEntidad = "perfil-privado" | "pagina-publica" | "grupo-jerarquico" | "grupo-democratico";

export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema {
  const base: PoliticaSistema = {};
  for (const capa of CAPAS_ORDEN) {
    base[capa] = { modo: "manual" };
  }
  if (tipo === "perfil-privado" || tipo === "grupo-jerarquico") {
    base.datos = { modo: "automatica-todas" };
    base.interfaz = { modo: "automatica-todas" };
    base.sw = { modo: "automatica-esta" };
  } else if (tipo === "pagina-publica") {
    for (const capa of CAPAS_ORDEN) {
      if (capa !== "servicios" && capa !== "modelos" && capa !== "nativa") {
        base[capa] = { modo: "automatica-todas" };
      }
    }
  } else if (tipo === "grupo-democratico") {
    base.datos = { modo: "automatica-todas" };
    base.interfaz = { modo: "automatica-todas" };
    base.sw = { modo: "automatica-esta" };
  }
  return base;
}

export interface ContextoDecision {
  ahoraH: number;
  esNeuronaElegida: boolean;
  aprobada: boolean;
  requiereAprobacion: boolean;
}

export type Decision = "aplicar" | "avisar" | "esperar";

export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision {
  if (ctx.requiereAprobacion && !ctx.aprobada) {
    return "esperar";
  }
  switch (p.modo) {
    case "automatica-todas":
      return "aplicar";
    case "automatica-esta":
      return ctx.esNeuronaElegida ? "aplicar" : "avisar";
    case "programada":
      const ventana = p.ventana ?? { desdeH: 3, hastaH: 6 }; // VENTANA_NOCTURNA default
      const h = ctx.ahoraH;
      if (ventana.desdeH === ventana.hastaH) {
        return "aplicar"; // 24-hour window
      }
      if (ventana.desdeH < ventana.hastaH) {
        return h >= ventana.desdeH && h < ventana.hastaH ? "aplicar" : "esperar";
       } else {
         return h >= ventana.desdeH || h < ventana.hastaH ? "aplicar" : "esperar";
       }
    default: // manual
      return "avisar";
  }
}

export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string, unknown> | undefined;
    let modo: ModoPolitica = "manual";
    if (c && typeof c.modo === "string") {
      const m = c.modo as ModoPolitica;
      if (["automatica-todas", "automatica-esta", "programada", "manual"].includes(m)) {
        modo = m;
      }
    }
    let ventana: { desdeH: number; hastaH: number } | undefined;
    if (modo === "programada") {
      const v = c?.ventana as Record<string, unknown> | undefined;
      const desdeH = v && typeof v.desdeH === "number" && v.desdeH >= 0 && v.desdeH <= 23 ? v.desdeH : null;
      const hastaH = v && typeof v.hastaH === "number" && v.hastaH >= 0 && v.hastaH <= 23 ? v.hastaH : null;
      if (desdeH !== null && hastaH !== null) {
        ventana = { desdeH, hastaH };
      } else {
        ventana = { desdeH: 3, hastaH: 6 }; // VENTANA_NOCTURNA
      }
    }
    out[capa] = ventana ? { modo, ventana } : { modo };
  }
  return out;
}