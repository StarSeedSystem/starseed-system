import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";

export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: { desdeH: number; hastaH: number };
}

export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;

export type TipoEntidad = "perfil-privado" | "pagina-publica" | "grupo-jerarquico" | "grupo-democratico";

export function politicaPorDefecto(tipo: TipoEntidad): PoliticaSistema;

export interface ContextoDecision {
  ahoraH: number;
  esNeuronaElegida: boolean;
  aprobada: boolean;
  requiereAprobacion: boolean;
}

export type Decision = "aplicar" | "avisar" | "esperar";

export function decidirPolitica(p: PoliticaCapa, ctx: ContextoDecision): Decision;

export function sanearPolitica(x: unknown): PoliticaSistema;