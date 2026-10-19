import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: { desdeH: number; hastaH: number };
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

export type TipoEntidad = "perfil-privado" | "pagina-publica" | "grupo-jerarquico" | "grupo-democratico";

const BASE_PERFIL: PoliticaSistema = {
  datos: { modo: "automatica-todas" },
  interfaz: { modo: "automatica-todas" },
  sw: { modo: "automatica-esta" },
  servicios: { modo: "manual" },
  modelos: { modo: "manual" },
  nativa: { modo: "manual" },
};

const BASE_PAGINA: PoliticaSistema = {
  datos: { modo: "automatica-todas" },
  interfaz: { modo: "automatica-todas" },
  sw: { modo: "automatica-todas" },
  servicios: { modo: "manual" },
  modelos: { modo: "manual" },
  nativa: { modo: "manual" },
};

export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema {
  if (tipo === "pagina-publica") return { ...BASE_PAGINA };
  return { ...BASE_PERFIL };
}

export function decidirPolitica(
  p: PoliticaCapa,
  ctx: { ahoraH: number; esNeuronaElegida: boolean; aprobada: boolean; requiereAprobacion: boolean }
): "aplicar" | "avisar" | "esperar" {
  if (ctx.requiereAprobacion && !ctx.aprobada) return "esperar";
  switch (p.modo) {
    case "automatica-todas":
      return "aplicar";
    case "automatica-esta":
      return ctx.esNeuronaElegida ? "aplicar" : "avisar";
    case "manual":
      return "avisar";
    case "programada": {
      const v = p.ventana;
      if (!v) return "esperar";
      const { desdeH, hastaH } = v;
      if (desdeH < hastaH) return ctx.ahoraH >= desdeH && ctx.ahoraH < hastaH ? "aplicar" : "esperar";
      if (desdeH > hastaH) return ctx.ahoraH >= desdeH || ctx.ahoraH < hastaH ? "aplicar" : "esperar";
      return "aplicar";
    }
  }
}

const MODOS_VALIDOS = new Set<ModoPolitica>(["automatica-todas", "automatica-esta", "programada", "manual"]);

export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string, unknown> | undefined;
    if (!c || typeof c !== "object") {
      out[capa] = { modo: "manual" };
      continue;
    }
    const modo = c.modo;
    if (typeof modo !== "string" || !MODOS_VALIDOS.has(modo as ModoPolitica)) {
      out[capa] = { modo: "manual" };
      continue;
    }
    if (modo === "programada") {
      const v = c.ventana as Record<string, unknown> | undefined;
      const desdeH = typeof v?.desdeH === "number" && v.desdeH >= 0 && v.desdeH <= 23 ? v.desdeH : null;
      const hastaH = typeof v?.hastaH === "number" && v.hastaH >= 0 && v.hastaH <= 23 ? v.hastaH : null;
      out[capa] = desdeH !== null && hastaH !== null ? { modo: "programada", ventana: { desdeH, hastaH } } : { modo: "manual" };
    } else {
      out[capa] = { modo: modo as ModoPolitica };
    }
  }
  return out;
}
