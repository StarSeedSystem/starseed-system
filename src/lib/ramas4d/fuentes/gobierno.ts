import type { Observador } from "../alcance";
import type { Nodo, Arista, AlcanceNodo } from "../modelo";
import type { Fuente } from "./tipos";
import type { Proposal, ProposalVote } from "@/lib/governance/types";
import type { Delegation } from "@/lib/governance/delegations";

export type PropuestaVista = Pick<
  Proposal,
  "id" | "scope" | "scope_ref" | "author" | "title" | "kind" | "options" | "params" | "status" | "created_at"
> &
  Partial<Pick<Proposal, "resolved_at" | "executed_at">>;

export type VotoVista = Pick<
  ProposalVote,
  "proposal_id" | "voter" | "choice" | "weight" | "created_at"
> &
  Partial<Pick<ProposalVote, "display_name" | "handle">>;

export type DelegacionVista = Pick<
  Delegation,
  "delegator_user" | "delegate_user" | "topic" | "expires_at"
> &
  Partial<Pick<Delegation, "scope" | "scope_ref">>;

export interface MembresiaVista {
  usuarioId: string;
  grupoSlug: string;
  rol?: string;
}

export interface DatosGobierno {
  propuestas?: PropuestaVista[];
  votos?: VotoVista[];
  delegaciones?: DelegacionVista[];
  membresias?: MembresiaVista[];
}

export type LectorGobierno = (observador: Observador) => Promise<DatosGobierno>;

function fecha(valor: string | null | undefined): number {
  const t = valor ? new Date(valor).getTime() : NaN;
  return Number.isFinite(t) ? t : Date.now();
}

export function alcanceDesdeScope(scope: string): AlcanceNodo {
  switch (scope) {
    case "global":
      return "publico";
    case "group":
      return "grupo";
    case "page":
    case "community":
      return "comunidad";
    default:
      return "privado";
  }
}

function pesoPropuesta(status: string): number {
  switch (status) {
    case "open":
      return 1;
    case "passed":
    case "executed":
      return 0.85;
    case "rejected":
      return 0.6;
    case "expired":
      return 0.4;
    case "failed":
      return 0.3;
    default:
      return 0.5;
  }
}

function refDePropuesta(propuesta: PropuestaVista): string {
  return `/network/politics?propuesta=${encodeURIComponent(propuesta.id)}`;
}

export function nodoDesdePropuesta(propuesta: PropuestaVista): Nodo {
  const alcance = alcanceDesdeScope(propuesta.scope);
  const dueno = alcance === "publico"
    ? "red"
    : propuesta.scope_ref ?? propuesta.author;
  const creada = fecha(propuesta.created_at);
  const actividad = fecha(propuesta.resolved_at ?? propuesta.executed_at ?? propuesta.created_at);
  return {
    id: `propuesta:${propuesta.id}`,
    tipo: "propuesta",
    titulo: propuesta.title,
    formato: "flujo",
    ref: refDePropuesta(propuesta),
    alcance,
    dueno,
    capas: ["gobierno", "propuestas", propuesta.status],
    t_creado: creada,
    t_actividad: actividad,
    peso: pesoPropuesta(propuesta.status),
    tema: propuesta.scope,
    categoria: propuesta.kind,
    etiquetas: [propuesta.kind, propuesta.status, propuesta.params.urgency].filter(Boolean),
  };
}

function etiquetaOpcion(propuesta: PropuestaVista, choice: string): string {
  return propuesta.options.find((opcion) => opcion.id === choice)?.label ?? choice;
}

export function nodosDesdeVotos(
  propuesta: PropuestaVista,
  votos: VotoVista[],
): { nodos: Nodo[]; aristas: Arista[] } {
  const nodos: Nodo[] = [];
  const aristas: Arista[] = [];
  const vistos = new Set<string>();

  for (const voto of votos) {
    if (voto.proposal_id !== propuesta.id || vistos.has(voto.voter)) continue;
    vistos.add(voto.voter);
    const id = `voto:${propuesta.id}:${voto.voter}`;
    const t = fecha(voto.created_at);
    nodos.push({
      id,
      tipo: "voto",
      titulo: `Voto · ${etiquetaOpcion(propuesta, voto.choice)}`,
      formato: "texto",
      ref: `${refDePropuesta(propuesta)}#voto-${encodeURIComponent(voto.voter)}`,
      alcance: "publico",
      dueno: voto.voter,
      capas: ["gobierno", "votos", propuesta.id],
      t_creado: t,
      t_actividad: t,
      peso: Math.max(0, voto.weight),
      tema: propuesta.scope,
      categoria: "voto",
      etiquetas: ["voto", voto.choice, ...(voto.handle ? [voto.handle] : [])],
    });
    aristas.push({
      de: id,
      a: `propuesta:${propuesta.id}`,
      tipo: "vota",
      t,
      intensidad: 1,
    });
  }

  return { nodos, aristas };
}

export function nodoDesdeDelegacion(delegacion: DelegacionVista): Nodo {
  const t = Date.now();
  return {
    id: `delegacion:${delegacion.delegator_user}:${delegacion.topic}:${delegacion.delegate_user}`,
    tipo: "conector",
    titulo: `Delegación · ${delegacion.topic}`,
    formato: "enlace",
    ref: `/network/politics?delegacion=${encodeURIComponent(delegacion.topic)}`,
    alcance: "privado",
    dueno: delegacion.delegator_user,
    capas: ["gobierno", "delegaciones", delegacion.topic],
    t_creado: t,
    t_actividad: t,
    peso: 0.5,
    tema: delegacion.topic,
    categoria: "delegacion",
    etiquetas: ["delegacion", delegacion.topic, delegacion.delegate_user],
  };
}

export function nodoDesdeMembresia(membresia: MembresiaVista): Nodo {
  const t = Date.now();
  return {
    id: `membresia:${membresia.grupoSlug}:${membresia.usuarioId}`,
    tipo: "conector",
    titulo: `Membresía · ${membresia.grupoSlug}`,
    formato: "enlace",
    ref: `/grupo/${membresia.grupoSlug}`,
    alcance: "privado",
    dueno: membresia.usuarioId,
    capas: ["gobierno", "membresia"],
    t_creado: t,
    t_actividad: t,
    peso: 0.6,
    tema: membresia.grupoSlug,
    categoria: "membresia",
    etiquetas: ["membresia", membresia.rol ?? "miembro", membresia.grupoSlug],
  };
}

async function leerGobiernoReal(observador: Observador): Promise<DatosGobierno> {
  const { createClient } = await import("@/utils/supabase/client");
  const supabase = createClient();
  const propuestas: PropuestaVista[] = [];
  const votos: VotoVista[] = [];

  try {
    const { data } = await supabase
      .from("proposals")
      .select("id, scope, scope_ref, author, title, kind, options, params, status, created_at, resolved_at, executed_at")
      .order("created_at", { ascending: false })
      .limit(120);
    if (Array.isArray(data)) propuestas.push(...(data as PropuestaVista[]));
  } catch {
    // sin propuestas visibles
  }

  const abiertas = propuestas.filter((p) => p.status === "open").slice(0, 20);
  if (abiertas.length > 0) {
    try {
      const { data } = await supabase
        .from("proposal_votes")
        .select("proposal_id, voter, choice, weight, created_at")
        .in("proposal_id", abiertas.map((p) => p.id));
      if (Array.isArray(data)) votos.push(...(data as VotoVista[]));
    } catch {
      // sin votos visibles
    }
  }

  let delegaciones: DelegacionVista[] = [];
  try {
    const { listMyDelegations } = await import("@/lib/governance/delegations");
    delegaciones = await listMyDelegations();
  } catch {
    delegaciones = [];
  }

  const membresias: MembresiaVista[] = [];
  const grupos = observador.grupos ? Array.from(observador.grupos) : [];
  if (grupos.length > 0) {
    try {
      const { data } = await supabase
        .from("os_memberships")
        .select("user_id, group_slug, role")
        .in("group_slug", grupos)
        .eq("user_id", observador.id);
      if (Array.isArray(data)) {
        for (const fila of data as Array<{ user_id?: string | null; group_slug?: string | null; role?: string | null }>) {
          if (fila.user_id && fila.group_slug) {
            membresias.push({ usuarioId: fila.user_id, grupoSlug: fila.group_slug, rol: fila.role ?? undefined });
          }
        }
      }
    } catch {
      // sin membresías visibles
    }
  }

  return { propuestas, votos, delegaciones, membresias };
}

export function crearFuenteGobierno(leer: LectorGobierno = leerGobiernoReal): Fuente {
  const suscriptores = new Set<(evento: { tipo: string; datos: unknown }) => void>();

  function emitir(evento: { tipo: string; datos: unknown }) {
    for (const cb of suscriptores) {
      try {
        cb(evento);
      } catch {
        // silencioso
      }
    }
  }

  return {
    id: "gobierno",
    capa: "gobierno",
    leer: async (observador: Observador) => {
      const datos = await leer(observador);
      const nodos = new Map<string, Nodo>();
      const aristas: Arista[] = [];
      const propuestas = datos.propuestas ?? [];
      const votos = datos.votos ?? [];

      for (const propuesta of propuestas) {
        const nodo = nodoDesdePropuesta(propuesta);
        nodos.set(nodo.id, nodo);
      }

      for (const propuesta of propuestas) {
        const suyos = votos.filter((voto) => voto.proposal_id === propuesta.id);
        if (suyos.length === 0) continue;
        const resultado = nodosDesdeVotos(propuesta, suyos);
        for (const nodo of resultado.nodos) nodos.set(nodo.id, nodo);
        aristas.push(...resultado.aristas);
      }

      for (const delegacion of datos.delegaciones ?? []) {
        const nodo = nodoDesdeDelegacion(delegacion);
        nodos.set(nodo.id, nodo);
      }

      for (const membresia of datos.membresias ?? []) {
        const nodo = nodoDesdeMembresia(membresia);
        nodos.set(nodo.id, nodo);
        aristas.push({
          de: nodo.id,
          a: `entidad:group:${membresia.grupoSlug}`,
          tipo: "participa",
          t: nodo.t_actividad,
          intensidad: 0.6,
        });
      }

      const validas = aristas.filter((a) => nodos.has(a.de) && nodos.has(a.a));
      emitir({
        tipo: "fuente_leida",
        datos: { fuenteId: "gobierno", nodos: nodos.size, aristas: validas.length },
      });
      return { nodos, aristas: validas };
    },
    suscribir: (callback) => {
      suscriptores.add(callback);
      return () => {
        suscriptores.delete(callback);
      };
    },
  };
}

export const fuenteGobierno = crearFuenteGobierno();

