// Decisión de seguridad, no de interfaz. Este módulo es PURO y solo decide;
// quien llame lo comprueba EN EL SERVIDOR contra la sesión real. Un permiso
// que se comprueba en el navegador no es un permiso, es una sugerencia.

export type Rol =
  | "dueño"
  | "desarrollador"
  | "invitado"
  | "servicio"
  | "ninguno";

export type Capacidad =
  | "ver"
  | "editar-perfil"
  | "lanzar-olas"
  | "publicar"
  | "editar-codigo"
  | "gestionar-accesos"
  | "usar-apis";

export interface Invitacion {
  correo: string;
  vigente: boolean;
  capacidades?: readonly Capacidad[];
}

export interface Mando {
  dueno: string;
  invitaciones?: readonly Invitacion[];
}

// La lista viva de desarrolladores vive en la base de datos; esto es solo la semilla.
export const DESARROLLADORES_INICIALES = ["maggasukha@star.seed"] as const;

const TODAS: readonly Capacidad[] = [
  "ver",
  "editar-perfil",
  "lanzar-olas",
  "publicar",
  "editar-codigo",
  "gestionar-accesos",
  "usar-apis",
];

const PROHIBIDAS_INVITADO: ReadonlySet<Capacidad> = new Set([
  "gestionar-accesos",
  "editar-codigo",
]);

function normaliza(correo: string): string {
  return correo.trim().toLowerCase();
}

export function rolDe(
  correo: string,
  mando: Mando,
  listaDesarrolladores: readonly string[],
): Rol {
  const c = normaliza(correo);
  if (c === normaliza(mando.dueno)) return "dueño";
  if (listaDesarrolladores.some((d) => normaliza(d) === c)) {
    return "desarrollador";
  }
  const vigente = mando.invitaciones?.some(
    (i) => i.vigente && normaliza(i.correo) === c,
  );
  if (vigente) return "invitado";
  return "ninguno";
}

export function puede(
  rol: Rol,
  capacidad: Capacidad,
  alcanceInvitacion?: readonly Capacidad[],
): boolean {
  if (rol === "ninguno") return false;
  if (rol === "dueño" || rol === "desarrollador") {
    return TODAS.includes(capacidad);
  }
  if (rol === "servicio") return capacidad === "usar-apis";
  if (rol === "invitado") {
    if (PROHIBIDAS_INVITADO.has(capacidad)) return false;
    if (!alcanceInvitacion) return false;
    return alcanceInvitacion.includes(capacidad);
  }
  return false;
}
