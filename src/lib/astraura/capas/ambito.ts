import type { EntityKind } from "@/lib/entity-kinds";
import type { EntityKind as EntityStateKind, EntityRef } from "@/lib/sync/entity-state";
import {
  CAMPOS_CAPA,
  CAPAS_ENTIDAD_DEFECTO,
  resolverCapasEntidad,
  type CapasAjustables,
} from "../capas-entidad";

export type CompartirAprendizaje = "nadie" | "ambito" | "red";
export type TipoAmbitoCapas = EntityKind | "cuenta";

export interface PerfilCapasAmbito {
  capasPreferidas: CapasAjustables;
  coleccionMemoria: string;
  adaptador?: string;
  aprende: boolean;
  comparteCon: CompartirAprendizaje;
}

export type PerfilCapasParcial = Partial<Omit<PerfilCapasAmbito, "capasPreferidas">> & {
  capasPreferidas?: Partial<CapasAjustables>;
};

export interface CadenaCapasAmbito {
  cuenta?: PerfilCapasParcial;
  ambito?: PerfilCapasParcial;
  personalidad?: PerfilCapasParcial;
  agente?: PerfilCapasParcial;
}

export interface PersonaCapasAmbito {
  id: string;
  rol?: string | null;
}

export interface AmbitoCambioCapas {
  tipo: TipoAmbitoCapas;
  id: string;
  propietarioId?: string;
  accion?: "apagar_aprendizaje_propio";
}

export type GobiernoAmbito = "jerarquico" | "democratico";
export type PermisoCambioCapas = "permitido" | "requiere_votacion" | "denegado";

export const CLAVE_CAPAS_AMBITO = "astraura:capas-ambito";

export const PERFIL_CAPAS_AMBITO_DEFECTO: PerfilCapasAmbito = {
  capasPreferidas: CAPAS_ENTIDAD_DEFECTO,
  coleccionMemoria: "general",
  aprende: false,
  comparteCon: "nadie",
};

const ORDEN_CADENA = ["cuenta", "ambito", "personalidad", "agente"] as const;

/** Resuelve cuenta → ámbito → personalidad → agente sin duplicar las capas existentes. */
export function resolverAmbito(cadena: CadenaCapasAmbito): PerfilCapasAmbito {
  const base = { ...CAPAS_ENTIDAD_DEFECTO, ...cadena.cuenta?.capasPreferidas,
    ...cadena.ambito?.capasPreferidas };
  const capas = resolverCapasEntidad(base, {
    personalidades: cadena.personalidad?.capasPreferidas
      ? { actual: cadena.personalidad.capasPreferidas } : {},
    agentes: cadena.agente?.capasPreferidas
      ? { actual: cadena.agente.capasPreferidas } : {},
  }, { personalidadId: "actual", agenteId: "actual" }).efectivas;
  const resuelto: PerfilCapasAmbito = { ...PERFIL_CAPAS_AMBITO_DEFECTO, capasPreferidas: capas };
  for (const nivel of ORDEN_CADENA) {
    const perfil = cadena[nivel];
    if (!perfil) continue;
    if (perfil.coleccionMemoria !== undefined) resuelto.coleccionMemoria = perfil.coleccionMemoria;
    if (perfil.adaptador !== undefined) resuelto.adaptador = perfil.adaptador;
    if (perfil.aprende !== undefined) resuelto.aprende = perfil.aprende;
    if (perfil.comparteCon !== undefined) resuelto.comparteCon = perfil.comparteCon;
  }
  return resuelto;
}

/** Normaliza lo leído de entity_state antes de usarlo en el navegador. */
export function leerPerfilCapasAmbito(valor: unknown): PerfilCapasAmbito {
  if (!valor || typeof valor !== "object") return resolverAmbito({});
  const v = valor as Record<string, unknown>;
  const fuente = v.capasPreferidas && typeof v.capasPreferidas === "object"
    ? v.capasPreferidas as Record<string, unknown> : {};
  const capas = Object.fromEntries(CAMPOS_CAPA.flatMap((campo) =>
    typeof fuente[campo] === "boolean" ? [[campo, fuente[campo]]] : [])) as Partial<CapasAjustables>;
  const compartir = v.comparteCon;
  return resolverAmbito({ ambito: {
    capasPreferidas: capas,
    coleccionMemoria: typeof v.coleccionMemoria === "string" ? v.coleccionMemoria : undefined,
    adaptador: typeof v.adaptador === "string" ? v.adaptador : undefined,
    aprende: typeof v.aprende === "boolean" ? v.aprende : undefined,
    comparteCon: compartir === "nadie" || compartir === "ambito" || compartir === "red"
      ? compartir : undefined,
  } });
}

const ROLES_ADMIN = new Set(["admin", "administrador", "owner", "dueño"]);

export function puedeCambiar(
  persona: PersonaCapasAmbito,
  ambito: AmbitoCambioCapas,
  gobierno: GobiernoAmbito,
): PermisoCambioCapas {
  const esPropio = ambito.propietarioId === persona.id ||
    ((ambito.tipo === "cuenta" || ambito.tipo === "personal") && ambito.id === persona.id);
  if (esPropio && ambito.accion === "apagar_aprendizaje_propio") return "permitido";
  if (!ROLES_ADMIN.has((persona.rol ?? "").toLowerCase())) return "denegado";
  return gobierno === "democratico" ? "requiere_votacion" : "permitido";
}

const KIND_STATE: Record<EntityKind, EntityStateKind> = {
  personal: "profile", comunidad: "community", ef: "ef", partido: "party",
  asamblea: "group", grupo: "group", evento: "event", pagina: "page", proyecto: "group",
};

export function referenciaCapasAmbito(tipo: TipoAmbitoCapas, id: string): EntityRef {
  return { kind: tipo === "cuenta" ? "user" : KIND_STATE[tipo], id };
}
