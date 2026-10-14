import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: { desdeH: number; hastaH: number };
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

export type TipoEntidad = "perfil-privado" | "pagina-publica" | "grupo-jerarquico" | "grupo-democratico";

export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema {
  const base: PoliticaSistema = {
    datos: { modo: "automatica-todas" },
    interfaz: { modo: "automatica-todas" },
    sw: { modo: "automatica-esta" },
    servicios: { modo: "manual" },
    modelos: { modo: "manual" },
    nativa: { modo: "manual" },
  };
  if (tipo === "pagina-publica") {
    // For public page, datos, interfaz, sw follow stable branch automatically; servicios, modelos, nativa manual
    return {
      ...base,
      sw: { modo: "manual" }, // Override sw to manual
    };
  }
  if (tipo === "grupo-jerarquico" || tipo === "grupo-democratico") {
    // Same as private profile
    return base;
  }
  // perfil-privado
  return base;
}

export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision {
  // If approval is required and not granted, always wait
  if (ctx.requiereAprobacion && !ctx.aprobada) {
    return "esperar";
  }
  switch (p.modo) {
    case "automatica-todas":
      return "aplicar";
    case "automatica-esta":
      return ctx.esNeuronaElegida ? "aplicar" : "avisar";
    case "programada":
      if (!p.ventana) {
        // Invalid programmatic policy without window -> treat as manual? Wait for approval? We'll wait.
        return "esperar";
      }
      const { desdeH, hastaH } = p.ventana;
      if (desdeH === hastaH) {
        // 24-hour window
        return "aplicar";
      }
      if (desdeH < hastaH) {
        return ctx.ahoraH >= desdeH && ctx.ahoraH < hastaH ? "aplicar" : "esperar";
      }
      // Window crosses midnight
      return ctx.ahoraH >= desdeH || ctx.ahoraH < hastaH ? "aplicar" : "esperar";
    default: // manual
      return "avisar";
  }
}

export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const out = {} as PoliticaSistema;
  for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string, unknown> | undefined;
    if (!c || typeof c !== "object") {
      out[capa] = { modo: "manual" };
      continue;
    }
    const modo = c.modo;
    if (
      typeof modo !== "string" ||
      !["automatica-todas", "automatica-esta", "programada", "manual"].includes(modo as ModoPolitica)
    ) {
      out[capa] = { modo: "manual" };
      continue;
    }
    if (modo === "programada") {
      const ventana = c.ventana as Record<string, unknown> | undefined;
      if (
        !ventana ||
        typeof ventana !== "object" ||
        typeof ventana.desdeH !== "number" ||
        typeof ventana.hastaH !== "number" ||
        ventana.desdeH < 0 ||
        ventana.desdeH > 23 ||
        ventana.hastaH < 0 ||
        ventana.hastaH > 23
      ) {
        out[capa] = { modo: "manual" };
        continue;
      }
      out[capa] = {
        modo: "programada",
        ventana: { desdeH: ventana.desdeH, hastaH: ventana.hastaH },
      };
    } else {
      out[capa] = { modo: modo as ModoPolitica };
    }
  }
  return out;
}