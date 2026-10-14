import { CAPAS_ORDEN, type CapaActualizacion } from "./manifiesto";

export type ModoPolitica = "automatica-todas" | "automatica-esta" | "programada" | "manual";
export interface PoliticaCapa {
  modo: ModoPolitica;
  ventana?: { desdeH: number; hastaH: number };
}
export type PoliticaSistema = Record<CapaActualizacion, PoliticaCapa>;
export type TipoEntidad = "perfil-privado" | "perfil" | "os" | "pagina-publica" | "pagina" | "grupo-jerarquico" | "grupo" | "grupo-democratico" | "comunidad" | "estudio" | "evento";
export type Decision = "aplicar" | "avisar" | "esperar";
export interface ContextoDecision {
  ahoraH: number;
  esNeuronaElegida: boolean;
  aprobada?: boolean;
  requiereAprobacion?: boolean;
}

export const MODOS_POLITICA: ModoPolitica[] = ["automatica-todas", "automatica-esta", "programada", "manual"];
export const NOMBRE_MODO: Record<ModoPolitica, string> = {
  "automatica-todas": "Automática (todas)",
  "automatica-esta": "Automática (esta neurona)",
  "programada": "Programada",
  "manual": "Manual (avisarme)",
};
export const VENTANA_NOCTURNA = { desdeH: 22, hastaH: 6 };
export const NOMBRE_TIPO: Record<TipoEntidad, string> = {
  "perfil-privado": "Perfil privado",
  "perfil": "Perfil",
  "os": "Genesis",
  "pagina-publica": "Página pública",
  "pagina": "Página",
  "grupo-jerarquico": "Grupo jerárquico",
  "grupo": "Grupo",
  "grupo-democratico": "Grupo democrático",
  "comunidad": "Comunidad",
  "estudio": "Estudio",
  "evento": "Evento",
};
