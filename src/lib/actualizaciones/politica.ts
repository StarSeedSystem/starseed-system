import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";
export { type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export const MODOS_POLITICA: readonly ModoPolitica[] = ["automatica-todas", "automatica-esta", "programada", "manual"];

export const NOMBRE_MODO: Record<ModoPolitica, string> = {
  "automatica-todas": "Automática en todas mis neuronas",
  "automatica-esta": "Automática solo en esta neurona",
  programada: "Programada",
  manual: "Manual (avisarme)",
};

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: { desdeH: number; hastaH: number };
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

export type TipoEntidad =
  | "perfil-privado"
  | "pagina-publica"
  | "grupo-jerarquico"
  | "grupo-democratico"
  | "perfil"
  | "pagina"
  | "grupo"
  | "comunidad"
  | "estudio"
  | "evento"
  | "os";

export const NOMBRE_TIPO: Record<TipoEntidad, string> = {
  "perfil-privado": "Perfil privado",
  perfil: "Perfil",
  os: "Genesis",
  "pagina-publica": "Página pública",
  pagina: "Página",
  "grupo-jerarquico": "Grupo jerárquico",
  grupo: "Grupo",
  "grupo-democratico": "Grupo democrático",
  comunidad: "Comunidad",
  estudio: "Estudio",
  evento: "Evento",
};

export const VENTANA_NOCTURNA = { desdeH: 3, hastaH: 6 };

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

const BASE_OS: PoliticaSistema = {
  datos: { modo: "automatica-todas" },
  interfaz: { modo: "automatica-todas" },
  sw: { modo: "automatica-todas" },
  servicios: { modo: "manual" },
  modelos: { modo: "programada", ventana: { ...VENTANA_NOCTURNA } },
  nativa: { modo: "manual" },
};

export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema {
  const base =
    tipo === "os"
      ? BASE_OS
      : ["perfil", "perfil-privado", "grupo-jerarquico", "grupo", "grupo-democratico"].includes(tipo)
      ? BASE_PERFIL
      : ["pagina", "pagina-publica", "comunidad", "estudio", "evento"].includes(tipo)
      ? BASE_PAGINA
      : BASE_PERFIL;
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const p = base[capa];
    out[capa] = { modo: p.modo, ventana: p.ventana ? { ...p.ventana } : undefined };
  }
  return out;
}

export type Decision = "aplicar" | "avisar" | "esperar";

export interface ContextoDecision {
  ahoraH: number;
  esNeuronaElegida: boolean;
  aprobada?: boolean;
  requiereAprobacion?: boolean;
}

export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision {
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
      if (desdeH === hastaH) return "aplicar";
      if (desdeH < hastaH) return ctx.ahoraH >= desdeH && ctx.ahoraH < hastaH ? "aplicar" : "esperar";
      return ctx.ahoraH >= desdeH || ctx.ahoraH < hastaH ? "aplicar" : "esperar";
    }
  }
}

export function resumenPolitica(p: PoliticaSistema): string {
  let auto = 0;
  let prog = 0;
  let avis = 0;
  for (const capa of CAPAS_ORDEN) {
    const c = p[capa];
    if (c.modo === "programada") prog++;
    else if (c.modo.startsWith("automatica")) auto++;
    else avis++;
  }
  const partes: string[] = [];
  if (auto > 0) partes.push(`${auto} ${auto === 1 ? "capa automática" : "capas automáticas"}`);
  if (prog > 0) partes.push(`${prog} ${prog === 1 ? "programada" : "programadas"}`);
  if (avis > 0) partes.push(`${avis} con aviso`);
  return partes.join(" · ") || "sin política";
}

export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, unknown> : {};
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string, unknown> | undefined;
    if (!c || typeof c !== "object" || Array.isArray(c)) {
      out[capa] = { modo: "manual" };
      continue;
    }
    const modo = c.modo;
    if (typeof modo !== "string" || !MODOS_POLITICA.includes(modo as ModoPolitica)) {
      out[capa] = { modo: "manual" };
      continue;
    }
    if (modo === "programada") {
      const v = c.ventana as Record<string, unknown> | undefined;
      const desdeOk = typeof v?.desdeH === "number" && v.desdeH >= 0 && v.desdeH <= 23;
      const hastaOk = typeof v?.hastaH === "number" && v.hastaH >= 0 && v.hastaH <= 23;
      if (desdeOk && hastaOk) {
        out[capa] = { modo: "programada", ventana: { desdeH: v.desdeH as number, hastaH: v.hastaH as number } };
      } else {
        out[capa] = { modo: "programada", ventana: { ...VENTANA_NOCTURNA } };
      }
    } else {
      out[capa] = { modo: modo as ModoPolitica };
    }
  }
  return out;
}
