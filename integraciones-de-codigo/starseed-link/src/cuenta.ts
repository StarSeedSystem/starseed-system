/**
 * cuenta — `entrar()` del kit StarSeed Link: la MISMA cuenta de StarSeed OS en cualquier app.
 * ═══════════════════════════════════════════════════════════════════════════════
 * Supabase Auth del proyecto activo (el que diga `config()`), con el cliente de la app. Acepta
 * correo o @usuario: un usuario sin «@» se busca en `os_profiles.handle` y, si no aparece, se
 * prueba `<usuario>@star.seed` (el correo interno que da el OS a las cuentas creadas por handle).
 * Los mensajes de error están en palabras de persona. Nunca lanza ni guarda contraseñas.
 */

import { usuarioDe, type ClienteSupabase, type UsuarioMinimo } from "./supabase";

export type ResultadoEntrar = { ok: true; usuario: UsuarioMinimo } | { ok: false; motivo: string };

/** Correo con el que se entra a partir de lo que escribió la persona (correo o @usuario). Pura. */
export function correoDeIdentificador(identificador: string, handleEncontrado?: string | null): string {
  const t = identificador.trim();
  if (t.includes("@") && !t.startsWith("@")) return t;
  const h = (handleEncontrado || t.replace(/^@/, "")).toLowerCase();
  return `${h}@star.seed`;
}

/** Traduce los errores de Supabase Auth a frases claras. Pura. */
export function motivoDeError(mensaje: string): string {
  const m = (mensaje || "").toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_grant")) {
    return "Credenciales inválidas. Comprueba tu usuario o correo y la contraseña de StarSeed OS.";
  }
  if (m.includes("email not confirmed")) return "Este correo aún no está confirmado en StarSeed OS.";
  if (m.includes("rate limit")) return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (m.includes("egress") || m.includes("quota") || m.includes("restricted")) {
    return "La base de datos a la que apunta esta app está restringida. Actualiza la app o recarga: el OS indica la activa.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión con StarSeed OS. Revisa internet.";
  return "No se pudo iniciar sesión en StarSeed OS.";
}

/** `entrar()`: inicia sesión con la cuenta de StarSeed OS. */
export async function entrar(
  cliente: ClienteSupabase | null | undefined,
  datos: { identificador: string; contrasena: string },
): Promise<ResultadoEntrar> {
  if (!cliente) return { ok: false, motivo: "La app no tiene conexión configurada con StarSeed OS." };
  const ident = (datos.identificador || "").trim();
  if (!ident) return { ok: false, motivo: "Escribe tu correo o tu usuario de StarSeed OS." };
  if (!datos.contrasena) return { ok: false, motivo: "Escribe tu contraseña." };
  let handle: string | null = null;
  if (!ident.includes("@") || ident.startsWith("@")) {
    try {
      const { data } = await cliente
        .from("os_profiles")
        .select("handle")
        .eq("handle", ident.replace(/^@/, "").toLowerCase())
        .maybeSingle();
      handle = data && typeof data.handle === "string" ? data.handle : null;
    } catch {
      handle = null;
    }
  }
  try {
    const { data, error } = await cliente.auth.signInWithPassword({
      email: correoDeIdentificador(ident, handle),
      password: datos.contrasena,
    });
    if (error) return { ok: false, motivo: motivoDeError(error.message) };
    const u = data?.user;
    if (!u || typeof u.id !== "string") return { ok: false, motivo: "StarSeed OS no devolvió la cuenta." };
    return { ok: true, usuario: { id: u.id, email: u.email ?? null } };
  } catch (e) {
    return { ok: false, motivo: motivoDeError(e instanceof Error ? e.message : "") };
  }
}

/** La cuenta con sesión abierta en esta app, o null. */
export const sesionActual = usuarioDe;

/** Cierra la sesión de esta app (no la del OS en otras apps o pestañas). */
export async function salir(cliente: ClienteSupabase | null | undefined): Promise<void> {
  try {
    await cliente?.auth.signOut();
  } catch {
    /* ya estaba fuera */
  }
}

/** Avisa al entrar o salir. Devuelve la baja. */
export function alCambiarCuenta(cliente: ClienteSupabase | null | undefined, cb: (u: UsuarioMinimo | null) => void): () => void {
  try {
    const r = cliente?.auth.onAuthStateChange?.((_e, s) => cb(s?.user ? { id: s.user.id, email: s.user.email ?? null } : null));
    const sub = r?.data?.subscription;
    return () => {
      try {
        sub?.unsubscribe();
      } catch {
        /* nada */
      }
    };
  } catch {
    return () => undefined;
  }
}
