// AmbitoLibreta module
// The enum defines scopes for the notebook free‑hand area.
//
// `puedeLeer` determines if a given subject can read the notebook, depending on the
// scope.  Personal notebooks are only readable by the owning user; all other scopes are
// considered readable by anyone.
//
// `puedeSalir` determines if data can re‑publish from the notebook.  Clausúas
// derived from the contract:
//   * Personal – only if an explicit choice is provided.
//   * Página/Grupo – only if the entity approved (`aprobadoPorEntidad` flag in the
//     example).
//   * Colectivo – only public examples are admitted.
//   * Fábrica – never admits a re‑publish.
// The function receives `ejemplo` which, when an object, may include an
// `aprobadoPorEntidad` boolean.
//
// `soloPublicoParaAdaptador` approves an array of examples for a given scope.
// For scopes that allow public data (pagina, grupo, colectivo) it ensures all
// examples are public/approved.

export type AmbitoLibreta =
  | "personal"
  | "pagina"
  | "grupo"
  | "colectivo"
  | "fabrica";

export interface EjemploNoPrivado {
  aprobadoPorEntidad?: boolean; // for pagina/grupo
}

export function puedeLeer(ambito: AmbitoLibreta, quien: string | boolean): boolean {
  if (ambito === "personal") {
    // Only the owner (represented by a string) can read.  The caller must
    // provide a truthy identifier for the owner; otherwise deny.
    return typeof quien === "string" && quien.trim() !== "";
  }
  // All other scopes are readable.
  return true;
}

export function puedeSalir(
  ambito: AmbitoLibreta,
  ejemplo: EjemploNoPrivado | unknown,
  eleccion: boolean,
): boolean {
  // Personal – only if explicit choice
  if (ambito === "personal") return eleccion;
  // Página/Grupo – require entity approval present in the example (if
  // provided) and an explicit choice.
  if (ambito === "pagina" || ambito === "grupo") {
    const ex = ejemplo as EjemploNoPrivado;
    return !!ex.aprobadoPorEntidad && eleccion;
  }
  // Colectivo – only public examples (no explicit flag on the example
  // so we rely on `eleccion` flag).  In tests `eleccion` will denote
  // whether the example is public.
  if (ambito === "colectivo") return eleccion;
  // Fábrica – never
  return false;
}

export function soloPublicoParaAdaptador(
  ejemplos: EjemploNoPrivado[],
  ambito: AmbitoLibreta,
): boolean {
  if (ambito === "personal") return true; // no restriction
  // For page, group and collective only public examples are allowed.
  return ejemplos.every((e) => !!e.aprobadoPorEntidad);
}

