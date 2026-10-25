/**
 * Entrar con código por correo (sin contraseña) — la lógica, sin interfaz.
 * ═══════════════════════════════════════════════════════════════════════════
 * (Ola 1025T · ACC1025A) Sale tal cual de `AuthGate` (Adenda 71-bis · 2026-07-17): como las direcciones
 * @star.seed no tienen SMTP, el OTP de Supabase por correo no llega. El OS GENERA el código y lo entrega
 * en la bandeja de correos y notificaciones del propio OS (`/api/auth/otp/request`, servidor con
 * service_role); la persona lo escribe y `/api/auth/otp/verify` lo valida y devuelve la sesión, que el
 * cliente canjea con `auth.setSession`. Aquí solo viven las dos llamadas y sus mensajes, para que la ventana
 * de acceso única y cualquier otra superficie hablen con las MISMAS rutas.
 *
 * Módulo PURO: sin React ni `node:*`. `fetch` y el canje de sesión son inyectables para probarlo.
 */

export const RUTA_PEDIR_CODIGO = "/api/auth/otp/request";
export const RUTA_VERIFICAR_CODIGO = "/api/auth/otp/verify";

/** Los 6 dígitos que se escriben; cualquier otra cosa se descarta mientras se teclea. */
export function soloDigitosCodigo(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 6);
}

export type RespuestaPedirCodigo = { ok: true; aviso: string } | { ok: false; error: string };

/** Pide el código para `correo`. Nunca lanza: el error viaja en el resultado. */
export async function pedirCodigoCorreo(
  correo: string,
  llamar: typeof fetch = fetch,
): Promise<RespuestaPedirCodigo> {
  const addr = correo.trim();
  if (!addr) return { ok: false, error: "Escribe tu correo para enviarte el código." };
  try {
    const res = await llamar(RUTA_PEDIR_CODIGO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr }),
    });
    const datos = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !datos.ok) return { ok: false, error: datos.error || "No se pudo generar el código." };
    return {
      ok: true,
      aviso:
        "Revisa tu bandeja de correos y notificaciones del OS (arriba a la derecha). Escribe aquí el código de 6 dígitos que aparece.",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}

/** Lo mínimo del cliente de Supabase que hace falta para canjear la sesión. */
export interface ClienteSesion {
  auth: {
    setSession(p: { access_token: string; refresh_token: string }): Promise<{ error: { message: string } | null }>;
  };
}

export type RespuestaVerificarCodigo = { ok: true } | { ok: false; error: string };

/** Verifica el código y, si vale, abre la sesión en el cliente. Nunca lanza. */
export async function verificarCodigoCorreo(
  correo: string,
  codigo: string,
  cliente: ClienteSesion,
  llamar: typeof fetch = fetch,
): Promise<RespuestaVerificarCodigo> {
  const addr = correo.trim();
  const c = codigo.trim();
  if (!addr || !/^\d{6}$/.test(c)) return { ok: false, error: "Escribe el código de 6 dígitos que te llegó al OS." };
  try {
    const res = await llamar(RUTA_VERIFICAR_CODIGO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr, code: c }),
    });
    const datos = (await res.json().catch(() => ({}))) as {
      error?: string;
      session?: { access_token: string; refresh_token: string };
    };
    if (!res.ok || !datos.session) return { ok: false, error: datos.error || "Código incorrecto o expirado." };
    const { error } = await cliente.auth.setSession({
      access_token: datos.session.access_token,
      refresh_token: datos.session.refresh_token,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red." };
  }
}
