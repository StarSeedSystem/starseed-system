/**
 * Per-scope + global SECURITY settings model for StarSeed OS.
 *
 * Adjustable + intelligent-auto security protocols and connection settings
 * (DNS, VPN, VPS/servidor, cifrado), configurable BOTH globally per-user AND
 * per scope (cerebro, grupo, página, archivo, publicación, mensaje, memoria,
 * cuenta). "Auto inteligente" = Astraura proposes secure, open-source-first
 * defaults; per-scope settings override the global (account) fallback.
 *
 * IMPORTANT (honest scope): StarSeed STORES and APPLIES the policy. VPN tunneling
 * and DNS enforcement happen at the device / brain-server level — the brain server
 * reads this policy and enforces it. This is NOT a system-wide VPN by itself.
 *
 * Secrets (VPN configs / credential blobs) are NOT stored here: they live in the
 * sovereign bot vault and are referenced by name (configRef / keyRef).
 */

"use client";

import { createClient } from "@/utils/supabase/client";

/* ------------------------------------------------------------------ */
/* Scopes                                                              */
/* ------------------------------------------------------------------ */

export type SecurityScopeId =
  | "account"
  | "brain"
  | "group"
  | "page"
  | "file"
  | "publication"
  | "message"
  | "memory";

export interface SecurityScopeDef {
  id: SecurityScopeId;
  /** Spanish label shown in the UI. */
  label: string;
  /** Whether this scope targets a concrete reference (needs a scope_ref). */
  needsRef: boolean;
  /** Supabase table to load reference options from, when applicable. */
  table?: string;
  /** Short Spanish hint for the scope_ref input. */
  refHint?: string;
}

/**
 * The scopes a security policy can be attached to. `account` is the global,
 * per-user fallback; every other scope overrides it for its target.
 */
export const SECURITY_SCOPES: SecurityScopeDef[] = [
  { id: "account", label: "Cuenta (global)", needsRef: false },
  { id: "brain", label: "Cerebro", needsRef: true, table: "brains", refHint: "ID del cerebro" },
  { id: "group", label: "Grupo", needsRef: true, table: "groups", refHint: "ID del grupo" },
  { id: "page", label: "Página", needsRef: true, table: "pages", refHint: "ID de la página" },
  { id: "file", label: "Archivo", needsRef: true, refHint: "ID del archivo" },
  { id: "publication", label: "Publicación", needsRef: true, refHint: "ID de la publicación" },
  { id: "message", label: "Mensaje", needsRef: true, refHint: "ID del mensaje / conversación" },
  { id: "memory", label: "Memoria", needsRef: true, refHint: "ID de la memoria" },
];

export function scopeById(id: string): SecurityScopeDef | undefined {
  return SECURITY_SCOPES.find((s) => s.id === id);
}

/* ------------------------------------------------------------------ */
/* DNS providers (open-source / privacy-friendly, with DoH URLs)       */
/* ------------------------------------------------------------------ */

export type DnsProviderId = "cloudflare" | "quad9" | "nextdns" | "custom";

export interface DnsProviderDef {
  id: DnsProviderId;
  label: string;
  /** Classic resolver IPs (informational). */
  ips: string[];
  /** DNS-over-HTTPS endpoint. */
  doh: string;
  /** Short Spanish blurb. */
  blurb: string;
}

export const DNS_PROVIDERS: DnsProviderDef[] = [
  {
    id: "cloudflare",
    label: "Cloudflare 1.1.1.1",
    ips: ["1.1.1.1", "1.0.0.1"],
    doh: "https://cloudflare-dns.com/dns-query",
    blurb: "Rápido y con foco en privacidad (no registra IPs). DoH/DoT estándar.",
  },
  {
    id: "quad9",
    label: "Quad9 9.9.9.9",
    ips: ["9.9.9.9", "149.112.112.112"],
    doh: "https://dns.quad9.net/dns-query",
    blurb: "Fundación sin ánimo de lucro. Bloquea dominios maliciosos. Privacidad por diseño.",
  },
  {
    id: "nextdns",
    label: "NextDNS",
    ips: ["45.90.28.0", "45.90.30.0"],
    doh: "https://dns.nextdns.io",
    blurb: "Configurable y open-source friendly. Filtros, analítica y perfiles propios.",
  },
  {
    id: "custom",
    label: "Personalizado (DoH propio)",
    ips: [],
    doh: "",
    blurb: "Tu propio resolutor DoH soberano (p. ej. un Pi-hole / AdGuard Home / Unbound con DoH).",
  },
];

export function dnsProviderById(id: string): DnsProviderDef | undefined {
  return DNS_PROVIDERS.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ */
/* Config shape                                                        */
/* ------------------------------------------------------------------ */

export type SecurityLevel = "básico" | "reforzado" | "máximo";

export interface SecurityConfig {
  dns: {
    provider: DnsProviderId;
    /** Use DNS-over-HTTPS (encrypted DNS). */
    doh: boolean;
    /** Custom DoH URL (only when provider === "custom"). */
    url?: string;
  };
  vpn: {
    enabled: boolean;
    type: "wireguard" | "openvpn" | "none";
    /** Name of the VPN config blob stored in the sovereign vault. */
    configRef?: string;
  };
  vps: {
    /** Force TLS-only (reject plain HTTP) on the brain server. */
    tlsOnly: boolean;
    /** Ports the brain server is allowed to expose. */
    allowedPorts: number[];
    /** Enable a host firewall (deny by default). */
    firewall: boolean;
    /** Enable fail2ban (ban brute-force sources). */
    fail2ban: boolean;
  };
  encryption: {
    /** End-to-end encryption for messages. */
    messagesE2E: boolean;
    /** Encryption at rest for stored data. */
    atRest: boolean;
    /** Name of the key/secret stored in the sovereign vault. */
    keyRef?: string;
  };
  level: SecurityLevel;
}

/* ------------------------------------------------------------------ */
/* Defaults                                                            */
/* ------------------------------------------------------------------ */

/** Sensible, privacy-first baseline used when no policy exists yet. */
export const SECURITY_DEFAULTS: SecurityConfig = {
  dns: { provider: "cloudflare", doh: true, url: "" },
  vpn: { enabled: false, type: "none", configRef: "" },
  vps: { tlsOnly: true, allowedPorts: [443], firewall: true, fail2ban: false },
  encryption: { messagesE2E: true, atRest: false, keyRef: "" },
  level: "básico",
};

/**
 * Merge a partial/loaded config over the defaults so the UI never reads
 * `undefined` from a half-filled row.
 */
export function normalizeConfig(input?: Partial<SecurityConfig> | null): SecurityConfig {
  const c = (input ?? {}) as Partial<SecurityConfig>;
  return {
    dns: {
      provider: c.dns?.provider ?? SECURITY_DEFAULTS.dns.provider,
      doh: c.dns?.doh ?? SECURITY_DEFAULTS.dns.doh,
      url: c.dns?.url ?? "",
    },
    vpn: {
      enabled: c.vpn?.enabled ?? SECURITY_DEFAULTS.vpn.enabled,
      type: c.vpn?.type ?? SECURITY_DEFAULTS.vpn.type,
      configRef: c.vpn?.configRef ?? "",
    },
    vps: {
      tlsOnly: c.vps?.tlsOnly ?? SECURITY_DEFAULTS.vps.tlsOnly,
      allowedPorts:
        Array.isArray(c.vps?.allowedPorts) && c.vps!.allowedPorts.length
          ? c.vps!.allowedPorts
          : [...SECURITY_DEFAULTS.vps.allowedPorts],
      firewall: c.vps?.firewall ?? SECURITY_DEFAULTS.vps.firewall,
      fail2ban: c.vps?.fail2ban ?? SECURITY_DEFAULTS.vps.fail2ban,
    },
    encryption: {
      messagesE2E: c.encryption?.messagesE2E ?? SECURITY_DEFAULTS.encryption.messagesE2E,
      atRest: c.encryption?.atRest ?? SECURITY_DEFAULTS.encryption.atRest,
      keyRef: c.encryption?.keyRef ?? "",
    },
    level: c.level ?? SECURITY_DEFAULTS.level,
  };
}

/* ------------------------------------------------------------------ */
/* "Intelligent auto" hardened presets                                 */
/* ------------------------------------------------------------------ */

/**
 * Returns a hardened SecurityConfig for the given level. These are the
 * "auto inteligente" presets that Astraura proposes as secure defaults.
 *
 *  - básico    -> DNS DoH + TLS-only + cifrado E2E de mensajes (sin VPN).
 *  - reforzado -> añade firewall + cifrado en reposo + DNS que bloquea dominios maliciosos (Quad9).
 *  - máximo    -> añade VPN WireGuard + fail2ban + superficie de puertos mínima (sólo 443).
 */
export function recommend(level: SecurityLevel): SecurityConfig {
  if (level === "máximo") {
    return {
      dns: { provider: "quad9", doh: true, url: "" },
      vpn: { enabled: true, type: "wireguard", configRef: "" },
      vps: { tlsOnly: true, allowedPorts: [443], firewall: true, fail2ban: true },
      encryption: { messagesE2E: true, atRest: true, keyRef: "" },
      level: "máximo",
    };
  }
  if (level === "reforzado") {
    return {
      dns: { provider: "quad9", doh: true, url: "" },
      vpn: { enabled: false, type: "none", configRef: "" },
      vps: { tlsOnly: true, allowedPorts: [443], firewall: true, fail2ban: true },
      encryption: { messagesE2E: true, atRest: true, keyRef: "" },
      level: "reforzado",
    };
  }
  // básico
  return {
    dns: { provider: "cloudflare", doh: true, url: "" },
    vpn: { enabled: false, type: "none", configRef: "" },
    vps: { tlsOnly: true, allowedPorts: [443, 80], firewall: true, fail2ban: false },
    encryption: { messagesE2E: true, atRest: false, keyRef: "" },
    level: "básico",
  };
}

/* ------------------------------------------------------------------ */
/* Human-readable explanation (Spanish)                                */
/* ------------------------------------------------------------------ */

/** Spanish summary of what a config does — shown next to "auto inteligente". */
export function explain(config: SecurityConfig): string {
  const c = normalizeConfig(config);
  const dns = dnsProviderById(c.dns.provider);
  const lines: string[] = [];

  lines.push(`Nivel de seguridad: ${c.level}.`);

  const dnsName = c.dns.provider === "custom" ? "DoH personalizado" : dns?.label ?? c.dns.provider;
  lines.push(
    `DNS: ${dnsName}${c.dns.doh ? " con cifrado DoH (DNS-over-HTTPS)" : " sin cifrar (recomendable activar DoH)"}.`,
  );

  if (c.vpn.enabled && c.vpn.type !== "none") {
    lines.push(
      `VPN: ${c.vpn.type === "wireguard" ? "WireGuard" : "OpenVPN"} activada${
        c.vpn.configRef ? ` (config «${c.vpn.configRef}» en tu bóveda)` : " (falta cargar la configuración)"
      }. El túnel se aplica a nivel de dispositivo / servidor del cerebro.`,
    );
  } else {
    lines.push("VPN: desactivada.");
  }

  const ports = c.vps.allowedPorts.length ? c.vps.allowedPorts.join(", ") : "ninguno";
  lines.push(
    `Servidor/VPS: ${c.vps.tlsOnly ? "sólo TLS" : "TLS no forzado"}; puertos permitidos ${ports}; firewall ${
      c.vps.firewall ? "activo" : "inactivo"
    }; fail2ban ${c.vps.fail2ban ? "activo" : "inactivo"}.`,
  );

  lines.push(
    `Cifrado: mensajes ${c.encryption.messagesE2E ? "E2E (extremo a extremo)" : "sin E2E"}; datos en reposo ${
      c.encryption.atRest ? "cifrados" : "sin cifrar en reposo"
    }${c.encryption.keyRef ? ` (clave «${c.encryption.keyRef}» en tu bóveda)` : ""}.`,
  );

  return lines.join(" ");
}

/* ------------------------------------------------------------------ */
/* CRUD over `security_settings`                                       */
/* ------------------------------------------------------------------ */

export interface SecurityRow {
  id?: string;
  owner: string;
  scope: string;
  scope_ref: string | null;
  config: SecurityConfig;
  auto: boolean;
  updated_at?: string;
}

/**
 * Read the policy for a given scope/ref. Returns exists=false (with defaults)
 * when none is stored yet (caller can fall back to the global/account policy).
 */
export async function getSecurity(
  scope: string,
  scopeRef?: string | null,
): Promise<{ config: SecurityConfig; auto: boolean; exists: boolean }> {
  const fallback = { config: normalizeConfig(SECURITY_DEFAULTS), auto: true, exists: false };
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return fallback;
    const ref = scope === "account" ? null : scopeRef || null;
    let q = sb.from("security_settings").select("*").eq("owner", uid).eq("scope", scope);
    q = ref === null ? q.is("scope_ref", null) : q.eq("scope_ref", ref);
    const { data } = await q.maybeSingle();
    if (!data) return fallback;
    const row = data as SecurityRow;
    return { config: normalizeConfig(row.config), auto: row.auto ?? true, exists: true };
  } catch {
    return fallback;
  }
}

/** Upsert the policy for a scope/ref. UNIQUE(owner,scope,scope_ref). */
export async function saveSecurity(
  scope: string,
  scopeRef: string | null,
  config: SecurityConfig,
  auto: boolean,
): Promise<boolean> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return false;
    const ref = scope === "account" ? null : scopeRef || null;
    await sb.from("security_settings").upsert(
      {
        owner: uid,
        scope,
        scope_ref: ref,
        config: normalizeConfig(config),
        auto,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner,scope,scope_ref" },
    );
    return true;
  } catch {
    return false;
  }
}

/** List every stored policy for the current user (for the overview/fallback note). */
export async function listSecurity(): Promise<SecurityRow[]> {
  try {
    const sb = createClient();
    const { data: au } = await sb.auth.getUser();
    const uid = au?.user?.id;
    if (!uid) return [];
    const { data } = await sb
      .from("security_settings")
      .select("*")
      .eq("owner", uid)
      .order("updated_at", { ascending: false });
    return ((data as SecurityRow[]) ?? []).map((r) => ({ ...r, config: normalizeConfig(r.config) }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Sovereign vault helper (store VPN / credential blobs by name)       */
/* ------------------------------------------------------------------ */

const VAULT_API = "https://starseed-neurocortex.vercel.app/api/vault";

export type VaultAction = "set" | "get";

/**
 * Store or read a named secret (VPN config blob, encryption key reference, …)
 * in the sovereign bot vault. Secrets never live in `security_settings`.
 */
export async function vaultSecret(
  accountId: string,
  action: VaultAction,
  name: string,
  value?: string,
): Promise<{ ok: boolean; value?: string; error?: string }> {
  try {
    const res = await fetch(VAULT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: accountId, action, name, value }),
    });
    const json = (await res.json()) as { ok?: boolean; value?: string; error?: string };
    return { ok: !!json.ok, value: json.value, error: json.error };
  } catch {
    return { ok: false, error: "No se pudo contactar con la bóveda soberana de StarSeed." };
  }
}
