/** Lógica pura de publicación de apps de IA propias de Genesis. */
export interface PeticionAppIa {
  inputs: Record<string, unknown>;
  query: string;
  conversation_id?: string;
  user?: string;
  response_mode?: "blocking";
}

const ID_APP = /^[a-z0-9][a-z0-9-]{0,63}$/;
const NOMBRE_ENV = /^[A-Z][A-Z0-9_]{1,79}$/;

export function idAppValido(valor: unknown): valor is string {
  return typeof valor === "string" && ID_APP.test(valor);
}

export function nombreVariableValido(valor: unknown): valor is string {
  return typeof valor === "string" && NOMBRE_ENV.test(valor);
}

export function claveAppAceptada(
  cabecera: string | null,
  nombreVariable: unknown,
  entorno: NodeJS.ProcessEnv,
): boolean {
  if (!nombreVariableValido(nombreVariable)) return false;
  const clave = entorno[nombreVariable];
  return typeof clave === "string" && clave.length > 0 && cabecera === `Bearer ${clave}`;
}

export function validarPeticionAppIa(cuerpo: unknown): string | null {
  if (!cuerpo || typeof cuerpo !== "object") return "JSON inválido.";
  const c = cuerpo as Record<string, unknown>;
  if (!c.inputs || typeof c.inputs !== "object" || Array.isArray(c.inputs)) {
    return "`inputs` debe ser un objeto.";
  }
  if (typeof c.query !== "string" || c.query.trim().length === 0) return "Falta `query`.";
  if (c.conversation_id !== undefined && typeof c.conversation_id !== "string") {
    return "`conversation_id` debe ser texto.";
  }
  if (c.response_mode !== undefined && c.response_mode !== "blocking") {
    return "Solo se admite `response_mode: blocking`.";
  }
  return null;
}
