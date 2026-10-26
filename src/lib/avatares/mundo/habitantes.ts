/**
 * Habitantes REALES del mundo de los avatares (Ola 1025U · U1): de las fuentes de la cuenta a
 * `AgenteMundoRef[]` con el contrato común (`agente-mundo.ts`). Puro: sin red ni disco; la lectura
 * de verdad vive en `habitantes-cuenta.ts`.
 *
 * Reglas del producto que se cumplen aquí:
 *  · Todo habitante es una IA: lleva `esBotIA: true` (lo pone `crearAgenteMundoRef`) y la chapa «Bot de IA».
 *  · Sin datos reales no se inventa a nadie: sin fuentes, la lista queda vacía.
 *  · Alcance de memoria (personal › perfil › grupo › pública, nunca al revés): un escenario de grupo o
 *    público NO muestra tus personalidades personales, solo lo que pertenece a una entidad.
 */
import { esBotDeEntidad, type Bot } from "@/lib/astraura-bots/tipos";
import { crearAgenteMundoRef, type AgenteMundoRef } from "./agente-mundo";
import type { VisibilidadEscenario } from "./escenarios";

/** El rótulo que acompaña a todo habitante del mundo. */
export const ETIQUETA_BOT_IA = "Bot de IA";

/** Cuántos habitantes se dibujan y simulan a la vez (el resto se avisa, no se calla). */
export const MAX_HABITANTES_VISIBLES = 24;

export interface FuenteBot {
  id: string;
  nombre: string;
  dueno: Bot["dueno"];
  activo: boolean;
  cuerpo?: { avatarRef?: string };
}

export interface FuenteAgenteGrupo {
  id: string;
  name: string;
  /** Id de la entidad (grupo o página) a la que sirve. */
  grupoId: string;
  entidadTipo?: "grupo" | "pagina";
}

export interface FuentesHabitantes {
  /** Cuenta dueña de las personalidades; sin sesión, `local`. */
  cuentaId?: string;
  personalidades?: ReadonlyArray<{ id: string; name: string }>;
  bots?: readonly FuenteBot[];
  agentesGrupo?: readonly FuenteAgenteGrupo[];
}

/**
 * Une las fuentes en una lista estable y sin repetidos: personalidades de la cuenta, bots de las
 * entidades (solo activos: un bot pausado no actúa, así que no se le inventa vida) y agentes de grupo.
 */
export function habitantesDeFuentes(f: FuentesHabitantes): AgenteMundoRef[] {
  const cuenta = f.cuentaId && f.cuentaId.trim() ? f.cuentaId.trim() : "local";
  const salida: AgenteMundoRef[] = [];
  const vistos = new Set<string>();
  const poner = (ref: AgenteMundoRef) => {
    if (vistos.has(ref.id)) return;
    vistos.add(ref.id);
    salida.push(ref);
  };

  for (const p of f.personalidades ?? []) {
    if (!p.id || !p.name) continue;
    poner(crearAgenteMundoRef({ origen: "personalidad", idOrigen: p.id, nombre: p.name, dueno: { tipo: "cuenta", id: cuenta } }));
  }
  for (const b of f.bots ?? []) {
    if (!b.id || !b.nombre || !b.activo || !esBotDeEntidad(b)) continue;
    poner(crearAgenteMundoRef({
      origen: "bot",
      idOrigen: b.id,
      nombre: b.nombre,
      dueno: { tipo: b.dueno.tipo, id: b.dueno.id },
      ...(b.cuerpo?.avatarRef ? { avatarRef: b.cuerpo.avatarRef } : {}),
    }));
  }
  for (const a of f.agentesGrupo ?? []) {
    if (!a.id || !a.name || !a.grupoId) continue;
    poner(crearAgenteMundoRef({
      origen: "agente-grupo",
      idOrigen: a.id,
      nombre: a.name,
      dueno: { tipo: a.entidadTipo === "pagina" ? "pagina" : "grupo", id: a.grupoId },
    }));
  }
  return salida;
}

/**
 * Quién puede estar en un escenario según su visibilidad. Privado: todo lo tuyo. De un grupo: solo lo
 * de esa entidad (o toda entidad si aún no tiene grupo elegido). Público: solo lo que pertenece a una
 * entidad; las personalidades personales nunca salen de la cuenta.
 */
export function habitantesVisibles(
  refs: readonly AgenteMundoRef[],
  escenario: { visibilidad: VisibilidadEscenario; grupoId?: string },
): AgenteMundoRef[] {
  if (escenario.visibilidad === "privada") return [...refs];
  const deEntidad = refs.filter((r) => r.origen !== "personalidad");
  if (escenario.visibilidad === "grupo" && escenario.grupoId) {
    return deEntidad.filter((r) => r.dueno.id === escenario.grupoId);
  }
  return deEntidad;
}

/**
 * Recorta a `max` habitantes repartiendo entre orígenes (uno de cada, por turnos) para que ninguna
 * fuente se coma el cupo. Devuelve cuántos quedan fuera para avisarlo.
 */
export function limitarHabitantes(
  refs: readonly AgenteMundoRef[],
  max: number = MAX_HABITANTES_VISIBLES,
): { visibles: AgenteMundoRef[]; ocultos: number } {
  const tope = Math.max(0, Math.floor(max));
  if (refs.length <= tope) return { visibles: [...refs], ocultos: 0 };
  const colas: AgenteMundoRef[][] = (["personalidad", "bot", "agente-grupo"] as const).map((o) => refs.filter((r) => r.origen === o));
  const elegidos = new Set<string>();
  while (elegidos.size < tope && colas.some((c) => c.length > 0)) {
    for (const cola of colas) {
      const siguiente = cola.shift();
      if (siguiente && elegidos.size < tope) elegidos.add(siguiente.id);
    }
  }
  // Se conserva el orden original de la lista.
  const visibles = refs.filter((r) => elegidos.has(r.id));
  return { visibles, ocultos: refs.length - visibles.length };
}

/** Frase corta del origen para la interfaz. */
export const ETIQUETA_ORIGEN: Record<AgenteMundoRef["origen"], string> = {
  personalidad: "Personalidad de tu cuenta",
  bot: "Bot de una entidad",
  "agente-grupo": "Agente de grupo",
};
