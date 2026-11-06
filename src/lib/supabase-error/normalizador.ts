export type CategoriaError =
  | "autenticación"
  | "permisos"
  | "conflicto"
  | "validación"
  | "no encontrado"
  | "rate limit"
  | "servicio";

export interface ErrorNormalizado {
  categoria: CategoriaError;
  codigoTecnico?: string;
  codigoUsuario: string;
  mensajeTecnico: string;
  mensajeUsuario: string;
}

export function clasificarErrorSupabase(error: unknown): CategoriaError {
  if (!error || typeof error !== "object") return "servicio";
  const e = error as Record<string, unknown>;
  if (e.name === "AuthError" || (typeof e.message === "string" && /auth|login|invalid.*credential/i.test(e.message as string))) {
    return "autenticación";
  }
  if (typeof e.code === "string") {
    if (e.code === "42501" || e.code === "PGRST301" || /permission|denied|forbidden/i.test(e.message as string)) return "permisos";
    if (e.code === "23505") return "conflicto";
    if (e.code.startsWith("235") || e.code === "PGRST100") return "validación";
    if (e.code === "PGRST116" || e.code === "42P01" || e.code === "PGRST205") return "no encontrado";
    if (e.code === "429") return "rate limit";
  }
  if (typeof e.status === "number") {
    if (e.status === 401 || e.status === 403) return "permisos";
    if (e.status === 404) return "no encontrado";
    if (e.status === 409) return "conflicto";
    if (e.status === 429) return "rate limit";
    if (e.status >= 500) return "servicio";
  }
  if (typeof e.message === "string" && /network|fetch|timeout/i.test(e.message)) return "servicio";
  return "servicio";
}

export function normalizarErrorSupabase(error: unknown): ErrorNormalizado {
  const categoria = clasificarErrorSupabase(error);
  const e = (error && typeof error === "object") ? error as Record<string, unknown> : {};
  const mensajeTecnico = (typeof e.message === "string" ? e.message : String(error)) || "Error desconocido";
  const codigoTecnico = typeof e.code === "string" ? e.code : undefined;
  let codigoUsuario = "error_desconocido";
  let mensajeUsuario = "Algo salió mal. Intenta de nuevo.";
  const esErrorRed = typeof e.message === "string" && /network|fetch|timeout/i.test(e.message);
  switch (categoria) {
    case "autenticación":
      codigoUsuario = "auth_error";
      mensajeUsuario = traducirMensajeAuth(mensajeTecnico);
      break;
    case "permisos":
      codigoUsuario = "permission_denied";
      mensajeUsuario = "No tienes permiso para realizar esta acción.";
      break;
    case "conflicto":
      codigoUsuario = "conflict_error";
      mensajeUsuario = "Este registro ya existe o está en uso.";
      break;
    case "validación":
      codigoUsuario = "validation_error";
      mensajeUsuario = "Los datos no son válidos. Revisa la información.";
      break;
    case "no encontrado":
      codigoUsuario = "not_found";
      mensajeUsuario = "No se encontró lo que buscas.";
      break;
    case "rate limit":
      codigoUsuario = "rate_limit";
      mensajeUsuario = "Demasiadas solicitudes. Intenta de nuevo en un momento.";
      break;
    case "servicio":
      codigoUsuario = esErrorRed ? "network_error" : "service_error";
      mensajeUsuario = esErrorRed ? "Error de conexión. Revisa tu internet." : "El servicio no está disponible. Intenta más tarde.";
      break;
  }
  return { categoria, codigoTecnico, codigoUsuario, mensajeTecnico, mensajeUsuario };
}

function traducirMensajeAuth(mensaje: string): string {
  const s = mensaje.toLowerCase();
  if (s.includes("invalid login") || s.includes("invalid credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (s.includes("already registered") || s.includes("already been registered")) {
    return "Ese correo ya tiene cuenta. Inicia sesión.";
  }
  if (s.includes("password should be") || s.includes("at least")) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }
  if (s.includes("unable to validate email") || s.includes("invalid email")) {
    return "Escribe un correo válido.";
  }
  if (s.includes("anonymous") && s.includes("disabled")) {
    return "El modo invitado no está disponible ahora mismo.";
  }
  if (s.includes("signups not allowed") || s.includes("signup is disabled")) {
    return "El registro está deshabilitado por ahora.";
  }
  if (s.includes("rate limit")) {
    return "Demasiados intentos. Espera un momento.";
  }
  return mensaje || "Error de autenticación.";
}
