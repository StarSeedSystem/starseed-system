import type { EntityKind } from "../entity-kinds";

export type TipoAmbito = "persona" | "entidad";
export type Visibilidad = "privado" | "miembros" | "publico";
export type ModoGobierno = "jerarquico" | "democratico";

export interface AmbitoMando {
  id: string;
  tipo: TipoAmbito;
  entidad_tipo?: EntityKind;
  entidad_ref?: string;
  perfil_id?: string;
  visibilidad: Visibilidad;
  modo_gobierno: ModoGobierno;
  creado_por?: string;
}

export type CapacidadAmbito =
  | "ver-resumen"
  | "ver-detalle"
  | "chatear"
  | "encolar"
  | "aprobar"
  | "lanzar-olas"
  | "usar-apis"
  | "publicar"
  | "gestionar-motores"
  | "gestionar-accesos"
  | "frenar"
  | "administrar";

export const CAPACIDADES_AMBITO: readonly CapacidadAmbito[] = [
  "ver-resumen",
  "ver-detalle",
  "chatear",
  "encolar",
  "aprobar",
  "lanzar-olas",
  "usar-apis",
  "publicar",
  "gestionar-motores",
  "gestionar-accesos",
  "frenar",
  "administrar",
] as const;

export type RolAmbito =
  | "dueño"
  | "delegado"
  | "owner"
  | "admin"
  | "moderator"
  | "editor"
  | "member"
  | "viewer"
  | "pending"
  | "visitante";

export const AMBITO_LOCAL: AmbitoMando = {
  id: "local",
  tipo: "persona",
  visibilidad: "privado",
  modo_gobierno: "jerarquico",
};

const PRIORIDAD_ROL: Record<RolAmbito, number> = {
  visitante: 0,
  viewer: 1,
  member: 2,
  editor: 3,
  moderator: 4,
  admin: 5,
  owner: 6,
  delegado: 7,
  dueño: 8,
  pending: -1,
};

function normalizaRol(r: string | null | undefined): string {
  return (r ?? "").toString().trim().toLowerCase();
}

export function rolDeFilas(
  filas: { role?: string | null }[],
): RolAmbito {
  if (!filas || filas.length === 0) return "visitante";

  let mejor: RolAmbito = "visitante";
  let mejorPrio = PRIORIDAD_ROL[mejor];
  let tienePending = false;

  for (const f of filas) {
    const r = normalizaRol(f.role);
    if (!r) continue;
    if (r === "miembro") {
      if (PRIORIDAD_ROL.member > mejorPrio) {
        mejor = "member";
        mejorPrio = PRIORIDAD_ROL.member;
      }
      continue;
    }
    if (r === "moderador") {
      if (PRIORIDAD_ROL.moderator > mejorPrio) {
        mejor = "moderator";
        mejorPrio = PRIORIDAD_ROL.moderator;
      }
      continue;
    }
    if (r === "pending") {
      tienePending = true;
      continue;
    }
    const rolValido = r as RolAmbito;
    if (PRIORIDAD_ROL[rolValido] !== undefined) {
      const prio = PRIORIDAD_ROL[rolValido];
      if (prio > mejorPrio) {
        mejor = rolValido;
        mejorPrio = prio;
      }
    }
  }

  if (mejor === "visitante" && tienePending) return "pending";
  return mejor;
}

type CapacidadesArgs = {
  ambito: AmbitoMando;
  rol: RolAmbito;
  delegadas?: readonly CapacidadAmbito[];
  aprobadas?: readonly CapacidadAmbito[];
  miembrosEncolan?: boolean;
};

export function capacidadesDe({
  ambito,
  rol,
  delegadas = [],
  aprobadas = [],
  miembrosEncolan = false,
}: CapacidadesArgs): Set<CapacidadAmbito> {
  const caps = new Set<CapacidadAmbito>();

  if (rol === "pending") return caps;

  if (rol === "visitante") {
    if (ambito.visibilidad === "publico") caps.add("ver-resumen");
    return caps;
  }

  if (rol === "delegado") {
    for (const c of delegadas) {
      if (c === "gestionar-accesos" || c === "administrar") continue;
      caps.add(c);
    }
    return caps;
  }

  const esPersona = ambito.tipo === "persona";
  const esDueñoPersona = esPersona && rol === "dueño";
  const esOwnerEntidad = !esPersona && rol === "owner";
  const esAdminEntidad = !esPersona && rol === "admin";
  const esModEditor = rol === "moderator" || rol === "editor";
  const esMemberViewer = rol === "member" || rol === "viewer";

  if (esDueñoPersona || esOwnerEntidad) {
    for (const c of CAPACIDADES_AMBITO) caps.add(c);
  } else if (esAdminEntidad) {
    for (const c of CAPACIDADES_AMBITO) {
      if (c === "administrar") continue;
      caps.add(c);
    }
  } else if (esModEditor) {
    caps.add("ver-resumen");
    caps.add("ver-detalle");
    caps.add("chatear");
    caps.add("encolar");
    caps.add("aprobar");
    caps.add("frenar");
  } else if (esMemberViewer) {
    caps.add("ver-resumen");
    caps.add("ver-detalle");
    caps.add("chatear");
    if (miembrosEncolan) caps.add("encolar");
  } else {
    caps.add("ver-resumen");
  }

  if (ambito.modo_gobierno === "democratico") {
    const requiereAprobacion: CapacidadAmbito[] = [
      "lanzar-olas",
      "publicar",
      "gestionar-motores",
      "usar-apis",
    ];
    for (const c of requiereAprobacion) {
      if (caps.has(c) && !aprobadas.includes(c)) {
        caps.delete(c);
      }
    }
  }

  return caps;
}

export function puedeEnAmbito(
  args: CapacidadesArgs,
  capacidad: CapacidadAmbito,
): boolean {
  return capacidadesDe(args).has(capacidad);
}
