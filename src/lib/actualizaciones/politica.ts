import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";
export { type CapaActualizacion } from "./manifiesto";
export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";
export interface PoliticaCapa { modo: ModoPolitica; ventana?: { desdeH: number; hastaH: number }; }
export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;
export type TipoEntidad = "perfil-privado" | "perfil" | "os" | "pagina-publica" | "pagina" | "grupo-jerarquico" | "grupo" | "grupo-democratico" | "comunidad" | "estudio" | "evento";
export type Decision = "aplicar" | "avisar" | "esperar";
export interface ContextoDecision { ahoraH: number; esNeuronaElegida: boolean; aprobada?: boolean; requiereAprobacion?: boolean; }
export const MODOS_POLITICA: ModoPolitica[] = ["automatica-todas", "automatica-esta", "programada", "manual"];
export const NOMBRE_MODO: Record<ModoPolitica, string> = { "automatica-todas": "Automática (todas)", "automatica-esta": "Automática (esta neurona)", "programada": "Programada", "manual": "Manual (avisarme)" };
export const VENTANA_NOCTURNA = { desdeH: 3, hastaH: 6 };
export const NOMBRE_TIPO: Record<TipoEntidad, string> = { "perfil-privado":"Perfil privado","perfil":"Perfil","os":"Genesis","pagina-publica":"Página pública","pagina":"Página","grupo-jerarquico":"Grupo jerárquico","grupo":"Grupo","grupo-democratico":"Grupo democrático","comunidad":"Comunidad","estudio":"Estudio","evento":"Evento" };
export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema {
  const perfilBase: PoliticaSistema = { datos:{modo:"automatica-todas"}, interfaz:{modo:"automatica-todas"}, sw:{modo:"automatica-esta"}, servicios:{modo:"manual"}, modelos:{modo:"manual"}, nativa:{modo:"manual"} };
  const paginaBase: PoliticaSistema = { datos:{modo:"automatica-todas"}, interfaz:{modo:"automatica-todas"}, sw:{modo:"automatica-todas"}, servicios:{modo:"manual"}, modelos:{modo:"manual"}, nativa:{modo:"manual"} };
  const osBase: PoliticaSistema = { datos:{modo:"automatica-todas"}, interfaz:{modo:"automatica-todas"}, sw:{modo:"automatica-todas"}, servicios:{modo:"manual"}, modelos:{modo:"programada", ventana: {desdeH:VENTANA_NOCTURNA.desdeH, hastaH:VENTANA_NOCTURNA.hastaH}}, nativa:{modo:"manual"} };
  if (tipo === "os") return osBase;
  if (["perfil","perfil-privado","grupo-jerarquico","grupo","grupo-democratico"].includes(tipo)) return perfilBase;
  return ["pagina","pagina-publica","comunidad","estudio","evento"].includes(tipo) ? paginaBase : perfilBase;
}
export function resumenPolitica(p: PoliticaSistema): string {
  let auto=0, prog=0, avis=0; for (const capa of CAPAS_ORDEN) { const c=p[capa]; if (c.modo==="programada") prog++; else if (c.modo.startsWith("automatica")) auto++; else avis++; }
  const partes:string[]=[]; if (auto>0) partes.push(`${auto} ${auto===1?"capa automática":"capas automáticas"}`); if (prog>0) partes.push(`${prog} ${prog===1?"programada":"programadas"}`); if (avis>0) partes.push(`${avis} con aviso`); return partes.join(" · ")||"sin política";
}
export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision {
  if (ctx.requiereAprobacion && !ctx.aprobada) return "esperar";
  switch (p.modo) {
    case "automatica-todas": return "aplicar";
    case "automatica-esta": return ctx.esNeuronaElegida ? "aplicar" : "avisar";
    case "programada": if (!p.ventana) return "esperar"; const {desdeH,hastaH}=p.ventana; if (desdeH===hastaH) return "aplicar"; if (desdeH<hastaH) return ctx.ahoraH>=desdeH && ctx.ahoraH<hastaH ? "aplicar":"esperar"; return ctx.ahoraH>=desdeH || ctx.ahoraH<hastaH ? "aplicar":"esperar";
    default: return "avisar";
  }
}
export function sanearPolitica(x: unknown): PoliticaSistema {
  const src = x && typeof x==="object" && !Array.isArray(x) ? x as Record<string,unknown> : {};
  const out = {} as PoliticaSistema; for (const capa of CAPAS_ORDEN) {
    const c = src[capa] as Record<string,unknown>|undefined; if (!c || typeof c!=="object" || Array.isArray(c)) { out[capa]={modo:"manual"}; continue; }
    const modo = c.modo; if (typeof modo!=="string" || !MODOS_POLITICA.includes(modo as ModoPolitica)) { out[capa]={modo:"manual"}; continue; }
    if (modo==="programada") {
      const ventana = c.ventana as Record<string,unknown>|undefined; if (!ventana || typeof ventana!=="object" || Array.isArray(ventana) || typeof ventana.desdeH!=="number" || typeof ventana.hastaH!=="number" || ventana.desdeH<0 || ventana.desdeH>23 || ventana.hastaH<0 || ventana.hastaH>23) { out[capa]={modo:"programada", ventana:VENTANA_NOCTURNA}; continue; }
      out[capa]={modo:"programada", ventana:{desdeH:ventana.desdeH, hastaH:ventana.hastaH}};
    } else { out[capa]={modo:modo as ModoPolitica}; }
  } return out;
}
