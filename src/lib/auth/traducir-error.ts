/**
 * Mensajes de error de acceso, en español — PURO.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025A) Sale de `auth-gate.tsx`, donde vivía como función suelta: la ventana de
 * acceso única (`ventana-acceso.tsx`) y su formulario (`auth-form.tsx`) dicen lo mismo con las
 * mismas palabras. Lo que Supabase devuelve en inglés se traduce; lo desconocido se muestra tal cual
 * (mejor el texto real que uno inventado) y, vacío, cae a un mensaje honesto.
 */
export function traducirErrorAuth(mensaje: string | null | undefined): string {
  const s = (mensaje || "").toLowerCase();
  if (s.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (s.includes("already registered") || s.includes("already been registered")) return "Ese correo ya tiene cuenta. Inicia sesión.";
  if (s.includes("password should be") || s.includes("at least")) return "La contraseña debe tener al menos 6 caracteres.";
  if (s.includes("unable to validate email") || s.includes("invalid email")) return "Escribe un correo válido.";
  if (s.includes("anonymous") && s.includes("disabled")) return "El modo invitado no está disponible ahora mismo.";
  if (s.includes("signups not allowed") || s.includes("signup is disabled")) return "El registro está deshabilitado por ahora.";
  if (s.includes("rate limit")) return "Demasiados intentos. Espera un momento.";
  return mensaje || "No se pudo completar. Intenta de nuevo.";
}
