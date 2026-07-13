"use client";

/**
 * Correos StarSeed — capa de datos sobre Supabase (RLS por owner/user_id).
 *
 * Cubre tres modelos reales ya existentes en la base + uno nuevo:
 *   · starseed_mail_config(owner, address, mx_host, smtp_port, imap_port, routing, updated_at)
 *       → "DNS/puertos" de la dirección interna @star.seed (cómo enruta el correo
 *         dentro de la red y cómo puede sincronizarse con correo externo).  [NUEVO]
 *   · account_emails(user_id, address, kind, visibility, uses, provider,
 *       connection_level, is_primary, ...) → correos vinculados (interno/creado/externo)
 *       con visibilidad, accesos e intención de sincronización ↔ externo (en routing/uses).
 *   · ss_mail(from_user,to_user,from_address,to_address,subject,body,attachments,
 *       folder,read,created_at) → buzón interno real entre cuentas @star.seed.
 *
 * Honestidad por diseño: el correo interno @star.seed funciona YA dentro del
 * ecosistema (mensajería entre cuentas StarSeed). El envío/recepción con correo
 * EXTERNO real (Gmail, etc.) requiere un proveedor/dominio de correo de verdad;
 * aquí modelamos la vinculación y la intención de sincronización, y lo decimos
 * con claridad en la UI.
 *
 * No duplica el cliente de Supabase: usa `@/utils/supabase/client`.
 * SSR-safe: las llamadas se hacen desde efectos/manejadores del lado cliente.
 */

import { createClient } from "@/utils/supabase/client";

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface MailConfig {
  id?: string;
  owner?: string;
  address: string;
  mx_host: string;
  smtp_port: number;
  imap_port: number;
  routing: MailRouting;
  updated_at?: string;
}

export interface MailRouting {
  /** Política de enrutado interno dentro de la red StarSeed. */
  internal_delivery?: "instant" | "queue";
  /** Dominio interno de la red. */
  domain?: string;
  /** Servicio de entrega interno (informativo / honesto-stub). */
  relay?: string;
  /** Sincronización con correo externo: intención + lista de direcciones. */
  external_sync?: {
    enabled: boolean;
    /** direcciones externas con las que se desea sincronizar */
    addresses?: string[];
    /** dirección/estrategia: pull (IMAP) / push (SMTP) / both */
    mode?: "off" | "pull" | "push" | "both";
  };
  /** Marca de honestidad: el transporte externo real aún no está conectado. */
  external_transport?: "none" | "provider";
  [k: string]: unknown;
}

export type EmailKind = "internal" | "created" | "external";
export type Visibility = "public" | "contacts" | "private";
export type ConnectionLevel = "none" | "verified" | "mailbox";

export interface AccountEmail {
  id: string;
  user_id: string;
  address: string;
  kind: EmailKind;
  visibility: Visibility;
  uses: Record<string, boolean>;
  provider: string;
  connection_level: ConnectionLevel;
  is_primary: boolean;
  verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SsMail {
  id: string;
  from_user: string | null;
  to_user: string | null;
  from_address: string | null;
  to_address: string | null;
  subject: string | null;
  body: string | null;
  attachments: unknown;
  folder: string;
  read: boolean;
  created_at: string;
}

// ── Defaults sensatos de la red StarSeed (enrutado interno prellenado) ───────

export function defaultRouting(domain = "star.seed"): MailRouting {
  return {
    internal_delivery: "instant",
    domain,
    relay: "starseed-internal",
    external_sync: { enabled: false, addresses: [], mode: "off" },
    external_transport: "none",
  };
}

export function defaultMailConfig(address: string): MailConfig {
  return {
    address,
    mx_host: "mx.star.seed",
    smtp_port: 2525,
    imap_port: 1143,
    routing: defaultRouting(),
  };
}

// ── Helpers de sesión ────────────────────────────────────────────────────────

async function uid(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ── starseed_mail_config (DNS/puertos del @star.seed) ────────────────────────

/**
 * Devuelve la config DNS/puertos para una dirección interna. Si no existe, la
 * crea con defaults sensatos (idempotente por (owner, address)).
 */
export async function getOrInitMailConfig(
  address: string,
): Promise<MailConfig | null> {
  const owner = await uid();
  if (!owner || !address) return null;
  const sb = createClient();
  try {
    const { data } = await sb
      .from("starseed_mail_config")
      .select("*")
      .eq("owner", owner)
      .eq("address", address)
      .maybeSingle();
    if (data) return normalizeConfig(data as MailConfig);

    const seed = defaultMailConfig(address);
    const { data: ins } = await sb
      .from("starseed_mail_config")
      .insert({ owner, ...seed })
      .select("*")
      .maybeSingle();
    return ins ? normalizeConfig(ins as MailConfig) : normalizeConfig({ ...seed, owner });
  } catch {
    return normalizeConfig({ ...defaultMailConfig(address), owner });
  }
}

export async function saveMailConfig(
  cfg: MailConfig,
): Promise<MailConfig | null> {
  const owner = await uid();
  if (!owner) return null;
  const sb = createClient();
  try {
    const payload = {
      owner,
      address: cfg.address,
      mx_host: cfg.mx_host,
      smtp_port: cfg.smtp_port,
      imap_port: cfg.imap_port,
      routing: cfg.routing ?? defaultRouting(),
      updated_at: new Date().toISOString(),
    };
    const { data } = await sb
      .from("starseed_mail_config")
      .upsert(payload, { onConflict: "owner,address" })
      .select("*")
      .maybeSingle();
    return data ? normalizeConfig(data as MailConfig) : normalizeConfig({ ...cfg, owner });
  } catch {
    return normalizeConfig({ ...cfg, owner });
  }
}

function normalizeConfig(c: MailConfig): MailConfig {
  return {
    ...c,
    mx_host: c.mx_host || "mx.star.seed",
    smtp_port: Number(c.smtp_port ?? 2525),
    imap_port: Number(c.imap_port ?? 1143),
    routing: { ...defaultRouting(), ...(c.routing || {}) },
  };
}

// ── account_emails (vinculación interno/externo) ─────────────────────────────

export async function listAccountEmails(): Promise<AccountEmail[]> {
  const id = await uid();
  if (!id) return [];
  const sb = createClient();
  try {
    const { data } = await sb
      .from("account_emails")
      .select("*")
      .eq("user_id", id)
      .order("kind", { ascending: true });
    return (data as AccountEmail[]) || [];
  } catch {
    return [];
  }
}

export function guessProvider(addr: string): string {
  const a = (addr || "").toLowerCase();
  if (a.includes("@gmail.")) return "gmail";
  if (a.includes("@outlook.") || a.includes("@hotmail.") || a.includes("@live."))
    return "outlook";
  if (a.includes("@yahoo.")) return "yahoo";
  if (a.includes("@icloud.")) return "icloud";
  if (a.endsWith("@star.seed")) return "starseed";
  return "imap";
}

export async function addExternalEmail(
  address: string,
  visibility: Visibility = "private",
): Promise<{ ok: boolean; error?: string }> {
  const id = await uid();
  if (!id) return { ok: false, error: "Sin sesión" };
  const addr = (address || "").trim().toLowerCase();
  if (!addr.includes("@")) return { ok: false, error: "Correo no válido" };
  const sb = createClient();
  try {
    const { error } = await sb.from("account_emails").insert({
      user_id: id,
      address: addr,
      kind: "external",
      visibility,
      uses: { login: false, notifications: true, recovery: false, contact: false },
      provider: guessProvider(addr),
      connection_level: "none",
      is_primary: false,
    });
    if (error) {
      const dup = /duplicate|unique/i.test(error.message);
      return { ok: false, error: dup ? "Ese correo ya está vinculado." : error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error" };
  }
}

export async function patchAccountEmail(
  id: string,
  patch: Partial<AccountEmail>,
): Promise<boolean> {
  const sb = createClient();
  try {
    await sb
      .from("account_emails")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    return true;
  } catch {
    return false;
  }
}

export async function removeAccountEmail(id: string): Promise<boolean> {
  const sb = createClient();
  try {
    await sb.from("account_emails").delete().eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/** Marca un externo como "verificado" (honesto: verificación de propiedad simbólica). */
export async function verifyExternalEmail(id: string): Promise<boolean> {
  const sb = createClient();
  try {
    await sb
      .from("account_emails")
      .update({
        connection_level: "verified",
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Activa/desactiva la intención de sincronización ↔ externo para un correo
 * vinculado. Se modela como `uses.sync` en account_emails Y como una entrada en
 * el `routing.external_sync` de la config interna del @star.seed.
 */
export async function setExternalSync(
  email: AccountEmail,
  internalAddress: string,
  on: boolean,
): Promise<boolean> {
  const sb = createClient();
  const ok1 = await patchAccountEmail(email.id, {
    uses: { ...(email.uses || {}), sync: on },
  });

  // Refleja en routing de la config interna
  try {
    const cfg = await getOrInitMailConfig(internalAddress);
    if (cfg) {
      const cur = cfg.routing.external_sync || { enabled: false, addresses: [] };
      const set = new Set(cur.addresses || []);
      if (on) set.add(email.address);
      else set.delete(email.address);
      const addresses = Array.from(set);
      const next: MailRouting = {
        ...cfg.routing,
        external_sync: {
          enabled: addresses.length > 0,
          addresses,
          mode: addresses.length > 0 ? "both" : "off",
        },
      };
      await saveMailConfig({ ...cfg, routing: next });
    }
  } catch {
    /* la parte de account_emails ya quedó persistida */
  }
  void sb;
  return ok1;
}

// ── ss_mail (buzón interno @star.seed) ───────────────────────────────────────

export async function listInbox(
  folder: "inbox" | "sent" = "inbox",
): Promise<SsMail[]> {
  const id = await uid();
  if (!id) return [];
  const sb = createClient();
  try {
    const q = sb
      .from("ss_mail")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    const { data } =
      folder === "sent"
        ? await q.eq("from_user", id).eq("folder", "sent")
        : await q.eq("to_user", id).neq("folder", "sent");
    return (data as SsMail[]) || [];
  } catch {
    return [];
  }
}

/** Resuelve el user_id destino a partir de una dirección interna @star.seed. */
export async function resolveInternalRecipient(
  toAddress: string,
): Promise<{ userId: string | null; address: string }> {
  const address = (toAddress || "").trim().toLowerCase();
  const sb = createClient();
  // 1) buscar en account_emails (correo interno/alias)
  try {
    const { data } = await sb
      .from("account_emails")
      .select("user_id,address")
      .eq("address", address)
      .maybeSingle();
    if (data?.user_id) return { userId: data.user_id as string, address };
  } catch {
    /* noop */
  }
  // 2) buscar en starseed_identities por dirección
  try {
    const { data } = await sb
      .from("starseed_identities")
      .select("owner,address")
      .eq("address", address)
      .maybeSingle();
    if (data?.owner) return { userId: data.owner as string, address };
  } catch {
    /* noop */
  }
  return { userId: null, address };
}

export async function sendInternalMail(params: {
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const id = await uid();
  if (!id) return { ok: false, error: "Sin sesión" };
  const to = (params.toAddress || "").trim().toLowerCase();
  if (!to.endsWith("@star.seed"))
    return {
      ok: false,
      error: "El correo interno sólo entrega a direcciones @star.seed.",
    };
  const sb = createClient();
  const { userId: toUser } = await resolveInternalRecipient(to);

  const base = {
    from_user: id,
    from_address: params.fromAddress,
    to_address: to,
    subject: params.subject || "(sin asunto)",
    body: params.body || "",
    attachments: [],
  };
  try {
    // Copia en "enviados" del remitente
    await sb.from("ss_mail").insert({ ...base, to_user: toUser, folder: "sent", read: true });
    // Entrega en bandeja del destinatario (si existe en la red)
    if (toUser) {
      await sb.from("ss_mail").insert({ ...base, to_user: toUser, folder: "inbox", read: false });
    } else {
      return {
        ok: true,
        error:
          "Enviado y guardado en tu folder de enviados. Aún no hay una cuenta StarSeed con esa dirección, así que quedará pendiente de entrega.",
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || "Error al enviar" };
  }
}

export async function markRead(id: string, read = true): Promise<void> {
  const sb = createClient();
  try {
    await sb.from("ss_mail").update({ read }).eq("id", id);
  } catch {
    /* noop */
  }
}
