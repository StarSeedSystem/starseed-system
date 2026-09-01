"use client";

/**
 * DIRECCIÓN PÚBLICA DE INTERNET (Adenda 197).
 * ----------------------------------------------------------------------------
 * `@star.seed` es la identidad DENTRO de la red StarSeed, pero `.seed` no
 * existe en la raíz del DNS: ningún servidor de correo del mundo puede
 * entregarle nada. Comprobado contra los servidores raíz.
 *
 * Por eso cada cuenta tiene ADEMÁS una dirección real, en un dominio que sí
 * existe, con el MISMO nombre de usuario:
 *      maggasukha@star.seed        → identidad interna (la que se ve en el OS)
 *      maggasukha@star.seed.dpdns.org → la que se da al resto de internet
 *
 * El dominio se configura en `NEXT_PUBLIC_STARSEED_MAIL_DOMAIN`. Mientras no
 * esté puesto, esto NO inventa direcciones: dice honestamente que la dirección
 * pública está pendiente de activarse, en vez de dar uno que rebotaría.
 */

/** Dominio real del correo de la red (vacío = aún no activado). */
export function dominioPublico(): string {
  const env = process.env as Record<string, string | undefined>;
  return (env.NEXT_PUBLIC_STARSEED_MAIL_DOMAIN || "").trim().toLowerCase();
}

/** ¿Ya hay dominio real conectado? */
export function hayDireccionPublica(): boolean {
  return dominioPublico().includes(".");
}

/** Parte local de una dirección (lo de antes de la arroba). */
export function usuarioDe(direccion: string): string {
  return (direccion || "").split("@")[0].trim().toLowerCase();
}

/**
 * Dirección pública emparejada a una interna `@star.seed`.
 * Devuelve null si aún no hay dominio configurado.
 */
export function direccionPublicaDe(direccionInterna: string): string | null {
  const dom = dominioPublico();
  const user = usuarioDe(direccionInterna);
  if (!dom || !user) return null;
  return `${user}@${dom}`;
}

/** ¿Esta dirección es la pública de la red (no un correo externo del usuario)? */
export function esDireccionPublica(direccion: string): boolean {
  const dom = dominioPublico();
  return !!dom && (direccion || "").toLowerCase().endsWith(`@${dom}`);
}

/** Texto honesto para la UI cuando el dominio aún no está activo. */
export const AVISO_SIN_DOMINIO =
  "Tu dirección @star.seed funciona dentro de la red StarSeed. La dirección para recibir correo del resto de internet se activará en cuanto la red conecte su dominio público — te aparecerá aquí sola.";

/**
 * Asegura que la cuenta tenga registrada su dirección pública emparejada.
 * Idempotente y best-effort: si ya está, no duplica; si no hay dominio o no hay
 * sesión, no hace nada. Se llama al crear la identidad y al abrir Correos.
 */
export async function asegurarDireccionPublica(
  direccionInterna: string,
): Promise<{ ok: boolean; direccion?: string; motivo?: "sin-dominio" | "sin-sesion" | "error" }> {
  const publica = direccionPublicaDe(direccionInterna);
  if (!publica) return { ok: false, motivo: "sin-dominio" };
  try {
    const { createClient } = await import("@/utils/supabase/client");
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    const owner = u?.user?.id;
    if (!owner) return { ok: false, motivo: "sin-sesion" };

    const { data: ya } = await sb
      .from("account_emails")
      .select("id")
      .eq("user_id", owner)
      .ilike("address", publica)
      .limit(1);
    if (Array.isArray(ya) && ya.length > 0) return { ok: true, direccion: publica };

    await sb.from("account_emails").insert({
      user_id: owner,
      address: publica,
      // `created` = dirección que la RED creó para ti (ni interna ni un correo
      // externo tuyo de otro proveedor).
      kind: "created",
      visibility: "public",
      uses: { login: false, notifications: true, recovery: false, contact: true },
      provider: "starseed",
      connection_level: "verified",
      is_primary: false,
    });
    return { ok: true, direccion: publica };
  } catch {
    return { ok: false, motivo: "error" };
  }
}
