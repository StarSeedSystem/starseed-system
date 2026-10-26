/**
 * Carga y guarda el gobierno de la Protomolécula de una entidad contra la cuenta (Ola 1026P · P2). Cliente.
 *
 * Vía de sincronización: la misma de los ajustes de gobernanza de la entidad, `governance_configs.params.config`
 * (clave `protomolecula.reglas`, como texto JSON). Así una regla cambiada por votación llega por el camino de siempre
 * (`set_config` aprobado → `gov_apply_approved_config`, en el servidor) y la escritura directa pasa por la verja de
 * propiedad de `saveConfig`. Todo se importa a demanda: lo que cuelga de la orbe no arrastra el motor de gobernanza
 * ni Supabase hasta que hace falta.
 *
 * Honestidad: si la cuenta no responde, las reglas se guardan SOLO en este aparato y se dice (`donde: "aparato"`);
 * si la verja de propiedad lo deniega, no se guarda en ninguna parte.
 */
import type { GovernanceMode } from "@/lib/governance/types";
import type { EntidadProto } from "../peticion/contrato";
import type { EntornoGobierno } from "./decision";
import { avisarCambio, guardarEstado, leerEstado, type EstadoEntidad, type OrigenReglas } from "./almacen";
import {
  CLAVE_REGLAS, esEntidadGobernada, normalizarReglas, reglasPorDefecto, scopeDeEntidad, serializarReglas,
  type ReglasProtomolecula, type TipoEntidadGobernada,
} from "./reglas";

export interface PersonaEnEntidad { usuarioId: string | null; rol: string | null; esDueno: boolean; sesion: boolean }

export interface EntornoCargado {
  persona: PersonaEnEntidad;
  entorno: EntornoGobierno;
  /** `null` = sin reglas propias guardadas. */
  reglasGuardadas: ReglasProtomolecula | null;
  origen: OrigenReglas;
  modoGobierno: GovernanceMode;
}

export type ResultadoGuardado =
  | { ok: true; donde: "cuenta" | "aparato"; aviso?: string }
  | { ok: false; motivo: string; bloqueado?: boolean };

type EntidadGobernada = EntidadProto & { tipo: TipoEntidadGobernada };

const fila = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});
const numero = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

/** ¿Esta cuenta es la dueña de la entidad? (`owner_id`; defensivo: ante cualquier duda, no.) */
async function esDuenoDe(e: EntidadGobernada, uid: string): Promise<boolean> {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const c = createClient();
    const tablas = e.tipo === "grupo" ? ["os_groups"] : e.tipo === "pagina" ? ["os_pages"] : ["os_pages", "os_groups"];
    for (const t of tablas) {
      const { data } = await c.from(t).select("owner_id").eq("slug", e.id).maybeSingle();
      if (data && (data as { owner_id?: string | null }).owner_id === uid) return true;
    }
  } catch {
    /* sin red */
  }
  return false;
}

async function personaEn(e: EntidadGobernada): Promise<PersonaEnEntidad> {
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const { data } = await createClient().auth.getUser();
    const uid = data?.user?.id ?? null;
    if (!uid) return { usuarioId: null, rol: null, esDueno: false, sesion: false };
    const { roleOf } = await import("@/lib/governance/permissions");
    const [rol, dueno] = await Promise.all([roleOf(scopeDeEntidad(e.tipo), e.id, uid).catch(() => null), esDuenoDe(e, uid)]);
    return { usuarioId: uid, rol: dueno ? (rol ?? "owner") : rol, esDueno: dueno, sesion: true };
  } catch {
    return { usuarioId: null, rol: null, esDueno: false, sesion: false };
  }
}

/** Lee reglas, modo y umbrales de la entidad, y quién eres tú en ella. Nunca lanza. */
export async function cargarEntorno(e: EntidadProto): Promise<EntornoCargado | null> {
  if (!esEntidadGobernada(e)) return null;
  const ent = e as EntidadGobernada;
  let modo: GovernanceMode = "democratic";
  let params: Record<string, unknown> = {};
  let remotas: ReglasProtomolecula | null = null;
  try {
    const { getConfig } = await import("@/lib/governance/config");
    const cfg = await getConfig(scopeDeEntidad(ent.tipo), ent.id);
    modo = cfg.mode === "hierarchical" ? "hierarchical" : "democratic";
    params = cfg.params ?? {};
    const crudo = fila(params.config)[CLAVE_REGLAS];
    if (crudo !== undefined && crudo !== null && crudo !== "") remotas = normalizarReglas(crudo, reglasPorDefecto(ent.tipo, modo));
  } catch {
    /* sin red: se queda lo último que se sabía */
  }
  const persona = await personaEn(ent);
  const antes = leerEstado(ent);
  const reglas = remotas ?? antes?.reglas ?? null;
  const origen: OrigenReglas = remotas ? "cuenta" : reglas ? (antes?.origen === "cuenta" ? "cuenta" : "aparato") : "ninguno";
  const votacion = { umbral: numero(params.threshold), minParticipantes: numero(params.minParticipants), minPorcentaje: numero(params.minPercent) };
  const estado: EstadoEntidad = { reglas, modoGobierno: modo, votacion, origen, leidoEn: Date.now() };
  guardarEstado(ent, estado);
  return { persona, reglasGuardadas: reglas, origen, modoGobierno: modo, entorno: { reglas, modoGobierno: modo, votacion } };
}

/**
 * Guarda unas reglas en la configuración de gobernanza de la entidad. La verja de propiedad es la de `saveConfig`
 * (solo la cuenta dueña escribe directamente); el resto de personas llevan el cambio a propuesta o votación.
 */
export async function guardarReglas(e: EntidadProto, reglas: ReglasProtomolecula, quien: string | null = null): Promise<ResultadoGuardado> {
  if (!esEntidadGobernada(e)) return { ok: false, motivo: "Esta pantalla no es un grupo, una comunidad ni una página." };
  const ent = e as EntidadGobernada;
  const final: ReglasProtomolecula = { ...normalizarReglas(reglas, reglas), actualizadoEn: Date.now(), actualizadoPor: quien };
  let modo: GovernanceMode = "democratic";
  try {
    const { getConfig, saveConfig } = await import("@/lib/governance/config");
    const scope = scopeDeEntidad(ent.tipo);
    const cfg = await getConfig(scope, ent.id);
    modo = cfg.mode === "hierarchical" ? "hierarchical" : "democratic";
    const params = { ...(cfg.params ?? {}), config: { ...fila(fila(cfg.params).config), [CLAVE_REGLAS]: serializarReglas(final) } };
    const r = await saveConfig(scope, ent.id, cfg.mode, params);
    if (r.ok) {
      guardarEstado(ent, { reglas: final, modoGobierno: modo, origen: "cuenta", leidoEn: Date.now(), ...(leerEstado(ent)?.votacion ? { votacion: leerEstado(ent)?.votacion } : {}) });
      avisarCambio(ent);
      return { ok: true, donde: "cuenta" };
    }
    // La verja de propiedad no es un fallo del medio: no se guarda en ninguna parte.
    if (/propietario/i.test(r.error ?? "")) return { ok: false, motivo: r.error ?? "Solo la cuenta dueña cambia esto directamente.", bloqueado: true };
    return aparato(ent, final, modo, r.error);
  } catch (err) {
    return aparato(ent, final, modo, err instanceof Error ? err.message : undefined);
  }
}

function aparato(ent: EntidadGobernada, final: ReglasProtomolecula, modo: GovernanceMode, motivo?: string): ResultadoGuardado {
  guardarEstado(ent, { reglas: final, modoGobierno: modo, origen: "aparato", leidoEn: Date.now(), ...(leerEstado(ent)?.votacion ? { votacion: leerEstado(ent)?.votacion } : {}) });
  avisarCambio(ent);
  return {
    ok: true,
    donde: "aparato",
    aviso: `No se pudo guardar en la cuenta de la entidad${motivo ? ` (${motivo})` : ""}. Queda SOLO en este aparato hasta que vuelva la conexión: las demás personas todavía no lo ven.`,
  };
}

/** Personas que forman parte de la entidad (para elegir a quién darle un permiso directo). `[]` si no se pueden leer. */
export async function listarPersonas(e: EntidadProto, tope = 200): Promise<{ id: string; nombre: string }[]> {
  if (!esEntidadGobernada(e)) return [];
  try {
    const { membersFromMemberships } = await import("@/lib/governance/membership");
    const ids = (await membersFromMemberships(e.id)).slice(0, tope);
    if (ids.length === 0) return [];
    let perfiles: Record<string, { displayName?: string; username?: string }> = {};
    try {
      const { fetchProfilesByIds } = await import("@/lib/social/os-profiles");
      perfiles = await fetchProfilesByIds(ids);
    } catch {
      /* sin directorio: se enseña el identificador acortado */
    }
    return ids
      .map((id) => {
        const p = perfiles[id];
        const nombre = p?.displayName || (p?.username ? `@${p.username}` : `Cuenta ${id.slice(0, 8)}`);
        return { id, nombre };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  } catch {
    return [];
  }
}

/** Lo que la interfaz necesita del exterior; se puede sustituir entero en las pruebas. */
export interface ServiciosGobierno {
  cargar: (e: EntidadProto) => Promise<EntornoCargado | null>;
  guardar: (e: EntidadProto, reglas: ReglasProtomolecula, quien: string | null) => Promise<ResultadoGuardado>;
  personas: (e: EntidadProto) => Promise<{ id: string; nombre: string }[]>;
}

export const SERVICIOS_POR_DEFECTO: ServiciosGobierno = { cargar: cargarEntorno, guardar: guardarReglas, personas: listarPersonas };
