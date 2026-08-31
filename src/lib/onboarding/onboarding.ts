"use client";

/**
 * Onboarding de StarSeed OS — capa de datos sobre Supabase (RLS por owner/user).
 *
 * Mantiene el estado de la guía de primera ejecución (onboarding_state), la
 * creación de identidad en la red (profiles, @handle único), la dirección
 * StarSeed (starseed_identities, p. ej. algo@star.seed) y el flujo de
 * recuperación/verificación.
 *
 * HONESTIDAD: `@star.seed` es una identidad DENTRO de StarSeed (no hay MX/SMTP
 * externo). La verificación por SMS/WhatsApp queda "pendiente de proveedor";
 * Telegram y el correo externo se registran como intención y se marcan local.
 *
 * Sigue el patrón de lib/aurora/personalities.ts / vaults-panel.tsx.
 */

import { createClient } from "@/utils/supabase/client";

// ── identidad del usuario autenticado ──────────────────────────────────
async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── tipos ───────────────────────────────────────────────────────────────
export interface OnboardingState {
  owner?: string;
  completed: boolean;
  steps: Record<string, unknown>;
  voice_started: boolean;
  updated_at?: string;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  completed: false,
  steps: {},
  voice_started: false,
};

export type RecoveryMethod = "telegram" | "whatsapp" | "sms";

export interface RecoveryConfig {
  email?: string;
  phone?: string;
  method?: RecoveryMethod;
}

/** Estado de verificación por canal: 'pendiente' | 'verificado' | 'registrado'. */
export type ChannelStatus = "pendiente" | "verificado" | "registrado";

export interface VerifiedMap {
  email?: ChannelStatus;
  telegram?: ChannelStatus;
  whatsapp?: ChannelStatus;
  sms?: ChannelStatus;
}

export interface ClaimProfileInput {
  fullName: string;
  handle: string;
  optional?: {
    avatar_url?: string;
    bio?: string;
    [k: string]: unknown;
  };
}

export interface StarseedIdentity {
  id?: string;
  owner?: string;
  address: string;
  variants: string[];
  recovery: RecoveryConfig;
  verified: VerifiedMap;
}

// ── estado de onboarding (onboarding_state) ──────────────────────────────
export async function getOnboarding(): Promise<OnboardingState> {
  try {
    const owner = await uid();
    if (!owner) return { ...DEFAULT_ONBOARDING };
    const sb = createClient();
    const { data } = await sb
      .from("onboarding_state")
      .select("*")
      .eq("owner", owner)
      .single();
    if (!data) return { ...DEFAULT_ONBOARDING };
    return {
      ...DEFAULT_ONBOARDING,
      ...(data as Partial<OnboardingState>),
      steps: ((data as { steps?: Record<string, unknown> }).steps) || {},
    };
  } catch {
    return { ...DEFAULT_ONBOARDING };
  }
}

export async function saveOnboarding(
  patch: Partial<OnboardingState>,
): Promise<OnboardingState | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const payload: Record<string, unknown> = {
      owner,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    // Adenda 188: `steps` se FUSIONA (shallow) con lo ya guardado — cada paso
    // del wizard escribe su parcela (cerebros, permisos, neurona, last…) sin
    // borrar las de los demás. Antes el upsert reemplazaba el JSON completo.
    if (patch.steps) {
      try {
        const cur = await getOnboarding();
        payload.steps = { ...(cur?.steps ?? {}), ...patch.steps };
      } catch { /* sin lectura previa: se escribe el patch tal cual */ }
    }
    const { data } = await sb
      .from("onboarding_state")
      .upsert(payload, { onConflict: "owner" })
      .select("*")
      .single();
    return data
      ? { ...DEFAULT_ONBOARDING, ...(data as Partial<OnboardingState>) }
      : null;
  } catch {
    return null;
  }
}

/**
 * (Adenda 191) Guarda SOLO los datos opcionales del perfil (avatar, portada,
 * bio) con un UPDATE directo por user_id — sin re-reclamar nombre/handle.
 * Antes, el paso opcional reutilizaba claimProfile y si el estado del handle
 * llegaba vacío (reanudación, prefill) explotaba con "@handle no válido".
 */
export async function saveProfileOptional(optional: {
  avatar_url?: string;
  cover_url?: string;
  bio?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const owner = await uid();
  if (!owner) return { ok: false, error: "Necesitas iniciar sesión." };
  const patch: Record<string, string> = {};
  if (optional.avatar_url) patch.avatar_url = optional.avatar_url;
  if (optional.cover_url) patch.cover_url = optional.cover_url;
  if (optional.bio) patch.bio = optional.bio;
  if (Object.keys(patch).length === 0) return { ok: true };
  try {
    const sb = createClient();
    const { error } = await sb.from("profiles").update(patch).eq("user_id", owner);
    if (error) return { ok: false, error: error.message };
    // (Adenda 194) Espejo en el perfil PÚBLICO: avatar, portada y bio son lo
    // que se ve en /profile, que lee `os_profiles`.
    await sincronizarPerfilPublico(owner, patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al guardar." };
  }
}

/**
 * (Adenda 194) Espejo en `os_profiles` — el perfil PÚBLICO que sirve
 * /profile/<handle>. Best-effort: si falla, la cuenta ya quedó bien en
 * `profiles` y no se bloquea el rito.
 */
export async function sincronizarPerfilPublico(
  owner: string,
  campos: { handle?: string; display_name?: string; avatar_url?: string; cover_url?: string; bio?: string },
): Promise<void> {
  try {
    const sb = createClient();
    const patch: Record<string, unknown> = { user_id: owner, is_default: true, kind: "sovereign" };
    if (campos.handle) { patch.handle = campos.handle; patch.username = campos.handle; }
    if (campos.display_name) patch.display_name = campos.display_name;
    if (campos.avatar_url) patch.avatar_url = campos.avatar_url;
    if (campos.cover_url) patch.cover_url = campos.cover_url;
    if (campos.bio) patch.bio = campos.bio;
    await sb.from("os_profiles").upsert(patch, { onConflict: "user_id" });
  } catch { /* el perfil privado ya está guardado; esto es el espejo público */ }
}

/**
 * (Adenda 194) Renombra la identidad interna y su dirección @star.seed al
 * handle REAL elegido. Sin esto quedaba colgado el nombre secundario que el
 * trigger inventaba al crear la cuenta.
 */
export async function renombrarIdentidadInterna(owner: string, handle: string): Promise<void> {
  const nueva = `${handle}@${STARSEED_DOMAIN}`;
  try {
    const sb = createClient();
    // ¿Esa dirección ya la tiene alguien más? Entonces no se toca nada.
    const { data: ocupada } = await sb
      .from("account_emails").select("id,user_id").ilike("address", nueva).limit(1);
    const ajena = ((ocupada as { user_id?: string }[]) || []).find((r) => r.user_id && r.user_id !== owner);
    if (ajena) return;
    await sb.from("starseed_identities")
      .update({ handle, email_handle: handle, address: nueva })
      .eq("owner", owner).eq("kind", "internal");
    await sb.from("account_emails")
      .update({ address: nueva })
      .eq("user_id", owner).eq("kind", "internal");
  } catch { /* la cuenta funciona igual con la dirección anterior */ }
}

// ── @handle en la red (profiles) ─────────────────────────────────────────
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;

/** Sanitiza un texto libre a un fragmento válido para handle/local-part. */
export function sanitizeHandle(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos
    .replace(/[^a-z0-9_]+/g, "_") // no permitidos → _
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
}

export function isValidHandle(handle: string): boolean {
  return HANDLE_RE.test(handle || "");
}

/**
 * ¿Está disponible el @handle en TODA la red? Comprueba `profiles` de forma
 * insensible a mayúsculas. Devuelve false si el formato es inválido.
 */
export async function isHandleAvailable(handle: string): Promise<boolean> {
  const h = (handle || "").trim();
  if (!isValidHandle(h)) return false;
  try {
    const sb = createClient();
    // case-insensitive: comparamos ilike exacto contra el handle.
    const { data } = await sb
      .from("profiles")
      .select("id,handle")
      .ilike("handle", h)
      .limit(1);
    const rows = (data as { id: string }[]) || [];
    return rows.length === 0;
  } catch {
    // En caso de error de red, no afirmamos disponibilidad.
    return false;
  }
}

/** Sugerencias de @handle a partir de nombre completo / handle deseado. */
export function suggestHandles(fullName: string, base?: string): string[] {
  const out: string[] = [];
  const seed = sanitizeHandle(base || fullName || "");
  const parts = (fullName || "")
    .trim()
    .split(/\s+/)
    .map((p) => sanitizeHandle(p))
    .filter(Boolean);
  const first = parts[0] || seed;
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const candidates = [
    seed,
    last ? `${first}_${last}` : "",
    last ? `${first.charAt(0)}_${last}` : "",
    last ? `${first}${last}` : "",
    `${seed}_${Math.floor(10 + Math.random() * 89)}`,
    `${first}_star`,
  ];
  for (const c of candidates) {
    const s = sanitizeHandle(c);
    if (s && isValidHandle(s) && !out.includes(s)) out.push(s);
  }
  return out.slice(0, 5);
}

/**
 * Crea o actualiza la fila `profiles` del usuario (display_name = nombre
 * completo, handle único). Resto de campos opcionales/editables.
 */
export async function claimProfile(
  input: ClaimProfileInput,
): Promise<{ ok: boolean; error?: string }> {
  const owner = await uid();
  if (!owner) return { ok: false, error: "Necesitas iniciar sesión." };

  const fullName = (input.fullName || "").trim();
  const handle = (input.handle || "").trim().toLowerCase();
  if (!fullName) return { ok: false, error: "El nombre completo es obligatorio." };
  if (!isValidHandle(handle)) {
    return { ok: false, error: "El @handle no es válido (3-20: a-z, 0-9, _)." };
  }

  try {
    const sb = createClient();

    // Comprueba que el handle no esté tomado por OTRO usuario.
    const { data: taken } = await sb
      .from("profiles")
      .select("id,user_id,handle")
      .ilike("handle", handle)
      .limit(1);
    const conflict = ((taken as { user_id?: string }[]) || []).find(
      (r) => r.user_id && r.user_id !== owner,
    );
    if (conflict) {
      return { ok: false, error: "Ese @handle ya está en uso en la red." };
    }

    const optional = input.optional || {};
    const payload: Record<string, unknown> = {
      user_id: owner,
      // (Adenda 194) El enum `profile_type` de la BD solo admite OFFICIAL ·
      // ARTISTIC · ANONYMOUS. Se enviaba "user" y TODO el upsert fallaba con
      // «invalid input value for enum profile_type» — por eso el nombre y el
      // @handle elegidos no llegaban a guardarse y mandaba el que inventó el
      // alta de cuenta. El perfil soberano de una persona es OFFICIAL.
      type: "OFFICIAL",
      handle,
      display_name: fullName,
      ...optional,
    };

    const { error } = await sb
      .from("profiles")
      .upsert(payload, { onConflict: "user_id" });
    if (error) return { ok: false, error: error.message };

    // (Adenda 194) El PERFIL PÚBLICO vive en `os_profiles`: es la tabla que lee
    // /profile/<handle>. Antes solo se escribía `profiles`, así que toda cuenta
    // nueva aterrizaba en «Perfil no encontrado» con el handle inventado por el
    // trigger. Se sincroniza aquí, con el handle que el usuario SÍ eligió.
    await sincronizarPerfilPublico(owner, {
      handle,
      display_name: fullName,
      avatar_url: (optional as { avatar_url?: string }).avatar_url,
      cover_url: (optional as { cover_url?: string }).cover_url,
      bio: (optional as { bio?: string }).bio,
    });
    // Y la identidad interna sigue al handle elegido: sin ella quedaba vivo el
    // «nombre secundario» (handle_aleatorio@star.seed) que nadie pidió.
    await renombrarIdentidadInterna(owner, handle);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al guardar el perfil." };
  }
}

// ── dirección StarSeed (starseed_identities) ─────────────────────────────
export const STARSEED_DOMAIN = "star.seed";
const LOCALPART_RE = /^[a-z0-9_.-]{2,32}$/;

/** Sanitiza la parte local de una dirección @star.seed. */
export function sanitizeLocalPart(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_.-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^[.\-_]+|[.\-_]+$/g, "")
    .slice(0, 32);
}

export function isValidStarseedAddress(address: string): boolean {
  const a = (address || "").trim().toLowerCase();
  if (!a.endsWith(`@${STARSEED_DOMAIN}`)) return false;
  const local = a.slice(0, a.length - (STARSEED_DOMAIN.length + 1));
  return LOCALPART_RE.test(local);
}

/**
 * Sugiere variantes de dirección @star.seed a partir del @handle y el nombre.
 * Ej: handle@star.seed, nombre.apellido@star.seed, n.apellido@star.seed,
 *     handle.seed@star.seed.
 */
export function suggestEmailVariants(handle: string, fullName: string): string[] {
  const h = sanitizeLocalPart(handle || "");
  const parts = (fullName || "")
    .trim()
    .split(/\s+/)
    .map((p) => sanitizeLocalPart(p))
    .filter(Boolean);
  const first = parts[0] || h;
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const locals = [
    h,
    last ? `${first}.${last}` : "",
    last ? `${first.charAt(0)}.${last}` : "",
    h ? `${h}.seed` : "",
    last ? `${first}${last}` : "",
  ];
  const out: string[] = [];
  for (const l of locals) {
    const loc = sanitizeLocalPart(l);
    const addr = loc ? `${loc}@${STARSEED_DOMAIN}` : "";
    if (addr && isValidStarseedAddress(addr) && !out.includes(addr)) out.push(addr);
  }
  return out.slice(0, 5);
}

/** ¿Está libre la dirección @star.seed en la red? (starseed_identities.address) */
export async function isEmailAvailable(address: string): Promise<boolean> {
  const a = (address || "").trim().toLowerCase();
  if (!isValidStarseedAddress(a)) return false;
  try {
    const sb = createClient();
    const { data } = await sb
      .from("starseed_identities")
      .select("id,address")
      .ilike("address", a)
      .limit(1);
    const rows = (data as { id: string }[]) || [];
    return rows.length === 0;
  } catch {
    return false;
  }
}

/**
 * Reclama una dirección StarSeed para el usuario. Inserta en
 * starseed_identities (o actualiza si el usuario ya tenía una).
 */
export async function claimStarseedEmail(
  address: string,
  variants: string[] = [],
  recovery: RecoveryConfig = {},
): Promise<{ ok: boolean; error?: string }> {
  const owner = await uid();
  if (!owner) return { ok: false, error: "Necesitas iniciar sesión." };
  const a = (address || "").trim().toLowerCase();
  if (!isValidStarseedAddress(a)) {
    return { ok: false, error: "Dirección @star.seed no válida." };
  }
  try {
    const sb = createClient();

    // ¿La dirección ya pertenece a otro owner?
    const { data: taken } = await sb
      .from("starseed_identities")
      .select("id,owner,address")
      .ilike("address", a)
      .limit(1);
    const conflict = ((taken as { owner?: string }[]) || []).find(
      (r) => r.owner && r.owner !== owner,
    );
    if (conflict) return { ok: false, error: "Esa dirección ya está tomada." };

    const cleanVariants = Array.from(
      new Set([a, ...(variants || []).map((v) => v.trim().toLowerCase())]),
    ).filter((v) => isValidStarseedAddress(v));

    // ¿El usuario ya tenía una identidad? Actualiza; si no, inserta.
    const { data: mine } = await sb
      .from("starseed_identities")
      .select("id")
      .eq("owner", owner)
      .limit(1);
    const existing = ((mine as { id: string }[]) || [])[0];

    if (existing?.id) {
      const { error } = await sb
        .from("starseed_identities")
        .update({ address: a, variants: cleanVariants, recovery })
        .eq("id", existing.id)
        .eq("owner", owner);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const { error } = await sb.from("starseed_identities").insert({
      owner,
      address: a,
      variants: cleanVariants,
      recovery,
      verified: {},
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "No se pudo reclamar la dirección." };
  }
}

/** Lee la identidad StarSeed del usuario (si existe). */
export async function getStarseedIdentity(): Promise<StarseedIdentity | null> {
  try {
    const owner = await uid();
    if (!owner) return null;
    const sb = createClient();
    const { data } = await sb
      .from("starseed_identities")
      .select("*")
      .eq("owner", owner)
      .limit(1)
      .single();
    if (!data) return null;
    const row = data as Record<string, unknown>;
    return {
      id: row.id as string,
      owner: row.owner as string,
      address: (row.address as string) || "",
      variants: (row.variants as string[]) || [],
      recovery: (row.recovery as RecoveryConfig) || {},
      verified: (row.verified as VerifiedMap) || {},
    };
  } catch {
    return null;
  }
}

// ── recuperación / verificación (flujo registrado) ───────────────────────
/**
 * Guarda la configuración de recuperación en starseed_identities.recovery.
 * Crea una identidad mínima si el usuario aún no reclamó dirección, para no
 * perder la configuración (address con placeholder en este registro local).
 */
export async function setRecovery(
  cfg: RecoveryConfig,
): Promise<{ ok: boolean; error?: string }> {
  const owner = await uid();
  if (!owner) return { ok: false, error: "Necesitas iniciar sesión." };
  try {
    const sb = createClient();
    const { data: mine } = await sb
      .from("starseed_identities")
      .select("id,recovery")
      .eq("owner", owner)
      .limit(1);
    const existing = ((mine as { id: string; recovery?: RecoveryConfig }[]) || [])[0];

    if (existing?.id) {
      const merged = { ...(existing.recovery || {}), ...cfg };
      const { error } = await sb
        .from("starseed_identities")
        .update({ recovery: merged })
        .eq("id", existing.id)
        .eq("owner", owner);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    // Aún sin dirección: registramos un placeholder con la recuperación.
    const placeholder = `${owner.slice(0, 12)}@${STARSEED_DOMAIN}`;
    const { error } = await sb.from("starseed_identities").insert({
      owner,
      address: placeholder,
      variants: [],
      recovery: cfg,
      verified: {},
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "No se pudo guardar la recuperación." };
  }
}

/**
 * Solicita verificación de un canal. HONESTO: no enviamos SMS/WhatsApp reales
 * (necesitan proveedor). Registramos la intención y marcamos el canal según su
 * disponibilidad. Devuelve un código local de 6 dígitos para que el usuario lo
 * confirme en el flujo (simulación honesta — no se envía a ningún sitio externo).
 */
export interface VerificationTicket {
  ok: boolean;
  channel: RecoveryMethod | "email";
  status: ChannelStatus;
  code?: string;
  live: boolean; // true si el canal tiene entrega real (hoy: ninguno)
  note: string;
  error?: string;
}

export async function requestVerification(
  channel: RecoveryMethod | "email",
): Promise<VerificationTicket> {
  const owner = await uid();
  if (!owner) {
    return {
      ok: false,
      channel,
      status: "pendiente",
      live: false,
      note: "Inicia sesión para verificar.",
      error: "no-auth",
    };
  }

  // Genera un código local (no se envía externamente).
  const code = String(Math.floor(100000 + Math.random() * 900000));

  // Estado registrado por canal — describimos qué es real vs pendiente.
  let status: ChannelStatus = "pendiente";
  let live = false;
  let note = "";
  switch (channel) {
    case "email":
      status = "registrado";
      note =
        "Correo externo registrado para recuperación. El envío real requiere un proveedor SMTP (pendiente).";
      break;
    case "telegram":
      status = "registrado";
      note =
        "Telegram registrado. El bot puede confirmar por DM cuando se conecte; por ahora queda registrado.";
      break;
    case "whatsapp":
      status = "pendiente";
      note = "WhatsApp pendiente de proveedor (Cloud API). Registrado como intención.";
      break;
    case "sms":
      status = "pendiente";
      note = "SMS pendiente de proveedor. Registrado como intención.";
      break;
  }

  try {
    const sb = createClient();
    const { data: mine } = await sb
      .from("starseed_identities")
      .select("id,verified")
      .eq("owner", owner)
      .limit(1);
    const existing = ((mine as { id: string; verified?: VerifiedMap }[]) || [])[0];
    if (existing?.id) {
      const verified: VerifiedMap = { ...(existing.verified || {}), [channel]: status };
      await sb
        .from("starseed_identities")
        .update({ verified })
        .eq("id", existing.id)
        .eq("owner", owner);
    }
  } catch {
    /* registro best-effort */
  }

  return { ok: true, channel, status, code, live, note };
}

/**
 * Confirma un código de verificación. Como no hay entrega externa real, esto
 * marca el canal como 'verificado' localmente cuando el usuario reingresa el
 * código emitido por requestVerification. Es un flujo honesto y registrado.
 */
export async function confirmVerification(
  channel: RecoveryMethod | "email",
  code: string,
  expected: string,
): Promise<{ ok: boolean; status: ChannelStatus; error?: string }> {
  const owner = await uid();
  if (!owner) return { ok: false, status: "pendiente", error: "no-auth" };
  if (!code || !expected || code.trim() !== expected.trim()) {
    return { ok: false, status: "pendiente", error: "Código incorrecto." };
  }
  try {
    const sb = createClient();
    const { data: mine } = await sb
      .from("starseed_identities")
      .select("id,verified")
      .eq("owner", owner)
      .limit(1);
    const existing = ((mine as { id: string; verified?: VerifiedMap }[]) || [])[0];
    const verified: VerifiedMap = { ...(existing?.verified || {}), [channel]: "verificado" };
    if (existing?.id) {
      await sb
        .from("starseed_identities")
        .update({ verified })
        .eq("id", existing.id)
        .eq("owner", owner);
    }
    return { ok: true, status: "verificado" };
  } catch (e) {
    return { ok: false, status: "pendiente", error: (e as Error)?.message };
  }
}
