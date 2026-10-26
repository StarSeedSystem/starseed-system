"use client";

/**
 * Lee los habitantes REALES de la cuenta (Ola 1025U · U1): personalidades de la cuenta + bots de las
 * entidades en las que la persona gestiona + agentes de grupo (agentes suyos atados a un grupo o página
 * en un ámbito público). Si una fuente no responde (sin sesión, sin red), las demás siguen y se dice
 * cuál falló; nunca se rellena con gente inventada.
 *
 * Lo que toca la red o la base (Supabase, la tabla de bots) se carga con `import()`: esto cuelga del
 * mundo, no del layout raíz.
 */
import type { AgenteMundoRef } from "./agente-mundo";
import { habitantesDeFuentes, type FuenteAgenteGrupo, type FuenteBot } from "./habitantes";
import { registrarFallo } from "@/lib/avatares/movimiento/daemon";
import { listPersonalityProfiles } from "@/lib/aurora/personalities";
import { listBindings, listPersonalAgents } from "@/lib/agents/store";
import { esBindingPrivado } from "@/lib/agents/agentes-grupo";

export interface EntidadMundo {
  tipo: "grupo" | "pagina";
  id: string;
  nombre: string;
}

/** Lo que el lector necesita del exterior; cada pieza se puede sustituir en las pruebas. */
export interface ServiciosHabitantes {
  personalidades: () => Array<{ id: string; name: string }>;
  /** `null` = sin sesión (no se pueden saber las entidades). */
  entidades: () => Promise<EntidadMundo[] | null>;
  botsDeEntidad: (e: EntidadMundo) => Promise<FuenteBot[]>;
  agentesGrupo: () => FuenteAgenteGrupo[];
  cuentaId: () => Promise<string>;
}

export interface HabitantesLeidos {
  agentes: AgenteMundoRef[];
  /** Entidades que gestiona la persona (para elegir el grupo de un escenario). */
  entidades: EntidadMundo[];
  /** Frases para la interfaz: qué fuente no se pudo leer y por qué. */
  avisos: string[];
  sinSesion: boolean;
}

/** Tope de entidades cuyos bots se leen de una vez (cada una es una consulta). */
const MAX_ENTIDADES = 20;

const SERVICIOS_REALES: ServiciosHabitantes = {
  personalidades: () => listPersonalityProfiles().map((p) => ({ id: p.id, name: p.name })),
  entidades: async () => {
    const { misEntidades } = await import("@/lib/genesis/entidades");
    const r = await misEntidades();
    if (!r.ok) return null;
    return r.lista.map((e) => ({ tipo: e.tipo, id: e.id, nombre: e.nombre }));
  },
  botsDeEntidad: async (e) => {
    const [{ createClient }, { botDeFila }] = await Promise.all([
      import("@/utils/supabase/client"),
      import("@/components/astraura-bots/bots-entidad"),
    ]);
    const r = await createClient().from("astraura_bots").select("*").eq("dueno_tipo", e.tipo).eq("dueno_id", e.id).limit(50);
    if (r.error) throw new Error(r.error.message);
    const filas = (r.data ?? []) as Record<string, unknown>[];
    return filas.map((f) => {
      const { bot } = botDeFila(f, { tipo: e.tipo, id: e.id, slug: e.id, nombre: e.nombre }, false);
      return { id: bot.id, nombre: bot.nombre, dueno: bot.dueno, activo: bot.activo, cuerpo: { avatarRef: bot.cuerpo.avatarRef } };
    });
  },
  agentesGrupo: () => {
    const agentes = new Map(listPersonalAgents().map((a) => [a.id, a] as const));
    const salida: FuenteAgenteGrupo[] = [];
    for (const b of listBindings()) {
      if ((b.targetType !== "group" && b.targetType !== "page") || esBindingPrivado(b)) continue;
      const a = agentes.get(b.agentId);
      if (!a) continue;
      salida.push({ id: a.id, name: a.name, grupoId: b.targetId, entidadTipo: b.targetType === "page" ? "pagina" : "grupo" });
    }
    return salida;
  },
  cuentaId: async () => {
    const { createClient } = await import("@/utils/supabase/client");
    const { data } = await createClient().auth.getSession();
    return data.session?.user?.id ?? "local";
  },
};

async function intentar<T>(contexto: string, f: () => T | Promise<T>, respaldo: T, avisos: string[], aviso: string): Promise<T> {
  try {
    return await f();
  } catch (error) {
    registrarFallo(contexto, error);
    avisos.push(aviso);
    return respaldo;
  }
}

export async function leerHabitantesDeCuenta(servicios: Partial<ServiciosHabitantes> = {}): Promise<HabitantesLeidos> {
  const s: ServiciosHabitantes = { ...SERVICIOS_REALES, ...servicios };
  const avisos: string[] = [];

  const [cuentaId, personalidades, agentesGrupo, entidadesLeidas] = await Promise.all([
    intentar("mundo.cuenta", () => s.cuentaId(), "local", [], ""),
    intentar("mundo.personalidades", () => s.personalidades(), [], avisos, "No se pudieron leer las personalidades de este aparato."),
    intentar("mundo.agentes-grupo", () => s.agentesGrupo(), [], avisos, "No se pudieron leer tus agentes de grupo."),
    intentar<EntidadMundo[] | null>("mundo.entidades", () => s.entidades(), null, avisos, "No se pudieron leer tus grupos y páginas."),
  ]);

  const sinSesion = entidadesLeidas === null;
  const entidades = (entidadesLeidas ?? []).slice(0, MAX_ENTIDADES);
  if (sinSesion && !avisos.some((a) => a.includes("grupos y páginas"))) {
    avisos.push("Sin sesión: solo se ven las personalidades y los agentes de este aparato. Inicia sesión para traer los bots de tus grupos y páginas.");
  }

  const resultados = await Promise.allSettled(entidades.map((e) => s.botsDeEntidad(e)));
  const bots: FuenteBot[] = [];
  let fallidas = 0;
  resultados.forEach((r) => {
    if (r.status === "fulfilled") bots.push(...r.value);
    else {
      fallidas += 1;
      registrarFallo("mundo.bots-entidad", r.reason);
    }
  });
  if (fallidas > 0) {
    avisos.push(`No se pudieron leer los bots de ${fallidas} ${fallidas === 1 ? "entidad" : "entidades"}.`);
  }

  return {
    agentes: habitantesDeFuentes({ cuentaId, personalidades, bots, agentesGrupo }),
    entidades,
    avisos,
    sinSesion,
  };
}

/** Los habitantes de la cuenta como lista de `AgenteMundoRef`. */
export async function habitantesDeCuenta(servicios: Partial<ServiciosHabitantes> = {}): Promise<AgenteMundoRef[]> {
  return (await leerHabitantesDeCuenta(servicios)).agentes;
}
