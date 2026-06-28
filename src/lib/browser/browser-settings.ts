"use client";

// src/lib/browser/browser-settings.ts
// StarSeed OS - Navegador: configuracion GLOBAL del navegador por usuario.
// Persiste en la tabla publica browser_settings (una fila por owner, RLS
// owner = auth.uid(), Realtime habilitado). Cubre VPN/DNS/cookies/cache/
// historial/VR-AR/proxy.
//
// HONESTIDAD TECNICA: una app web NO puede crear un tunel VPN ni reemplazar el
// resolutor DNS del sistema. Lo que SI hace de verdad: gestiona el HISTORIAL
// real dentro de la app (consultable y borrable), limpia cookies/cache DE LA
// PROPIA APP (sessionStorage + caches del Service Worker) y ALMACENA las
// preferencias de VPN/DNS/proxy para que la app de escritorio StarSeed o la
// extension (que SI tienen permisos de red) las apliquen.
//
// Fallback: sin sesion / Supabase falla -> defaults / { ok:false }. SSR-safe.

import { createClient } from "@/utils/supabase/client";
import { onTableChange, type RealtimePayload } from "@/lib/realtime/realtime";

const TABLE = "browser_settings";

export type CookiesPolicy = "allow" | "session-only" | "block-third-party" | "block";
export type CachePolicy = "normal" | "aggressive" | "no-store";
export type ProxyPrefer = "auto" | "personal" | "starseed" | "external" | "off";

export interface VpnPrefs { enabled: boolean; provider: string; region: string; note: string; }
export interface DnsPrefs { mode: "automatic" | "custom" | "doh"; servers: string[]; doh: string; note: string; }
export interface HistoryEntry { id: string; url: string; title: string; ts: string; }
export interface HistoryPrefs { enabled: boolean; entries: HistoryEntry[]; }
export interface VrArPrefs { enabled: boolean; default_immersive: boolean; }
export interface ProxyPrefs { prefer: ProxyPrefer; }

export interface BrowserSettings {
    vpn: VpnPrefs;
    dns: DnsPrefs;
    cookiesPolicy: CookiesPolicy;
    cachePolicy: CachePolicy;
    history: HistoryPrefs;
    vrAr: VrArPrefs;
    proxy: ProxyPrefs;
    updatedAt?: string;
}

export const MAX_HISTORY = 500;

export function defaultSettings(): BrowserSettings {
    return {
        vpn: { enabled: false, provider: "", region: "", note: "" },
        dns: { mode: "automatic", servers: [], doh: "", note: "" },
        cookiesPolicy: "allow",
        cachePolicy: "normal",
        history: { enabled: true, entries: [] },
        vrAr: { enabled: false, default_immersive: false },
        proxy: { prefer: "auto" },
    };
}

const COOKIES: CookiesPolicy[] = ["allow", "session-only", "block-third-party", "block"];
const CACHES: CachePolicy[] = ["normal", "aggressive", "no-store"];
const PREFERS: ProxyPrefer[] = ["auto", "personal", "starseed", "external", "off"];

function str(v: unknown, d = ""): string { return typeof v === "string" ? v : d; }
function bool(v: unknown, d = false): boolean { return typeof v === "boolean" ? v : d; }

function normalizeVpn(raw: unknown): VpnPrefs {
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<VpnPrefs>;
    return { enabled: bool(r.enabled), provider: str(r.provider), region: str(r.region), note: str(r.note) };
}

function normalizeDns(raw: unknown): DnsPrefs {
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<DnsPrefs>;
    const mode = r.mode === "custom" || r.mode === "doh" ? r.mode : "automatic";
    const servers = Array.isArray(r.servers) ? r.servers.filter((s): s is string => typeof s === "string") : [];
    return { mode, servers, doh: str(r.doh), note: str(r.note) };
}

function normalizeHistory(raw: unknown): HistoryPrefs {
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<HistoryPrefs>;
    const list = Array.isArray(r.entries) ? r.entries : [];
    const entries: HistoryEntry[] = list
        .map((e): HistoryEntry | null => {
            if (!e || typeof e !== "object") return null;
            const x = e as Partial<HistoryEntry>;
            if (typeof x.url !== "string" || !x.url) return null;
            return {
                id: str(x.id) || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                url: x.url,
                title: str(x.title) || x.url,
                ts: str(x.ts) || new Date().toISOString(),
            };
        })
        .filter((e): e is HistoryEntry => e !== null)
        .slice(0, MAX_HISTORY);
    return { enabled: bool(r.enabled, true), entries };
}

function normalizeVrAr(raw: unknown): VrArPrefs {
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<VrArPrefs>;
    return { enabled: bool(r.enabled), default_immersive: bool(r.default_immersive) };
}

function normalizeProxy(raw: unknown): ProxyPrefs {
    const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ProxyPrefs>;
    const prefer = PREFERS.includes(r.prefer as ProxyPrefer) ? (r.prefer as ProxyPrefer) : "auto";
    return { prefer };
}

interface BrowserSettingsRow {
    owner?: string;
    vpn?: unknown;
    dns?: unknown;
    cookies_policy?: unknown;
    cache_policy?: unknown;
    history?: unknown;
    vr_ar?: unknown;
    proxy?: unknown;
    updated_at?: string | null;
}

export function normalizeSettings(raw: unknown): BrowserSettings {
    if (!raw || typeof raw !== "object") return defaultSettings();
    const r = raw as BrowserSettingsRow;
    const cookiesPolicy = COOKIES.includes(r.cookies_policy as CookiesPolicy) ? (r.cookies_policy as CookiesPolicy) : "allow";
    const cachePolicy = CACHES.includes(r.cache_policy as CachePolicy) ? (r.cache_policy as CachePolicy) : "normal";
    return {
        vpn: normalizeVpn(r.vpn),
        dns: normalizeDns(r.dns),
        cookiesPolicy,
        cachePolicy,
        history: normalizeHistory(r.history),
        vrAr: normalizeVrAr(r.vr_ar),
        proxy: normalizeProxy(r.proxy),
        updatedAt: typeof r.updated_at === "string" ? r.updated_at : undefined,
    };
}

async function uid(): Promise<string | null> {
    try {
        const sb = createClient();
        const { data } = await sb.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

function toRow(owner: string, s: BrowserSettings) {
    return {
        owner,
        vpn: s.vpn,
        dns: s.dns,
        cookies_policy: s.cookiesPolicy,
        cache_policy: s.cachePolicy,
        history: s.history,
        vr_ar: s.vrAr,
        proxy: s.proxy,
        updated_at: new Date().toISOString(),
    };
}

/** Carga la configuracion global (o defaults si no hay fila / sin sesion). */
export async function loadSettings(): Promise<BrowserSettings> {
    try {
        const owner = await uid();
        if (!owner) return defaultSettings();
        const sb = createClient();
        const { data } = await sb.from(TABLE).select("*").eq("owner", owner).maybeSingle();
        return normalizeSettings(data ?? null);
    } catch {
        return defaultSettings();
    }
}

export interface SettingsResult {
    ok: boolean;
    needsAuth?: boolean;
    error?: string;
    settings?: BrowserSettings;
}

/** Upsert de la configuracion global completa (por owner). */
export async function saveSettings(s: BrowserSettings): Promise<SettingsResult> {
    const owner = await uid();
    if (!owner) return { ok: false, needsAuth: true };
    try {
        const sb = createClient();
        const { data, error } = await sb
            .from(TABLE)
            .upsert(toRow(owner, s), { onConflict: "owner" })
            .select("*")
            .maybeSingle();
        if (error) return { ok: false, error: error.message };
        return { ok: true, settings: normalizeSettings(data ?? toRow(owner, s)) };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

/** Registra una visita en el historial real (dedup por URL consecutiva). */
export async function recordVisit(url: string, title?: string): Promise<void> {
    if (!url) return;
    try {
        const owner = await uid();
        if (!owner) return;
        const sb = createClient();
        const { data } = await sb.from(TABLE).select("history").eq("owner", owner).maybeSingle();
        const cur = normalizeHistory((data as { history?: unknown } | null)?.history);
        if (!cur.enabled) return;
        const head = cur.entries[0];
        const entry: HistoryEntry = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url,
            title: (title || "").trim() || url,
            ts: new Date().toISOString(),
        };
        const next = head && head.url === url ? [entry, ...cur.entries.slice(1)] : [entry, ...cur.entries];
        const trimmed = next.slice(0, MAX_HISTORY);
        await sb.from(TABLE).upsert(
            { owner, history: { enabled: cur.enabled, entries: trimmed }, updated_at: new Date().toISOString() },
            { onConflict: "owner" },
        );
    } catch {
        /* best-effort */
    }
}

/** Borra TODO el historial (conservando la preferencia enabled). */
export async function clearHistory(): Promise<SettingsResult> {
    const owner = await uid();
    if (!owner) return { ok: false, needsAuth: true };
    try {
        const sb = createClient();
        const { data: cur } = await sb.from(TABLE).select("history").eq("owner", owner).maybeSingle();
        const enabled = normalizeHistory((cur as { history?: unknown } | null)?.history).enabled;
        const { error } = await sb.from(TABLE).upsert(
            { owner, history: { enabled, entries: [] }, updated_at: new Date().toISOString() },
            { onConflict: "owner" },
        );
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

/** Elimina una sola entrada del historial por id. */
export async function deleteHistoryEntry(id: string): Promise<SettingsResult> {
    const owner = await uid();
    if (!owner) return { ok: false, needsAuth: true };
    try {
        const sb = createClient();
        const { data: cur } = await sb.from(TABLE).select("history").eq("owner", owner).maybeSingle();
        const h = normalizeHistory((cur as { history?: unknown } | null)?.history);
        const next = h.entries.filter((e) => e.id !== id);
        const { error } = await sb.from(TABLE).upsert(
            { owner, history: { enabled: h.enabled, entries: next }, updated_at: new Date().toISOString() },
            { onConflict: "owner" },
        );
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message };
    }
}

/**
 * Limpieza REAL de cookies/cache DE LA PROPIA APP que el navegador permite:
 * sessionStorage (NO localStorage: ahi vive la sesion) + caches del Service
 * Worker via CacheStorage. NO toca cookies httpOnly ni el cache del sistema.
 * SSR-safe.
 */
export async function clearAppCookiesAndCache(opts?: {
    cookies?: boolean;
    cache?: boolean;
}): Promise<{ ok: boolean; cleared: string[] }> {
    const cleared: string[] = [];
    if (typeof window === "undefined") return { ok: false, cleared };
    const doCookies = opts?.cookies ?? true;
    const doCache = opts?.cache ?? true;
    try {
        if (doCookies) {
            try {
                const cookies = document.cookie ? document.cookie.split(";") : [];
                for (const c of cookies) {
                    const name = c.split("=")[0]?.trim();
                    if (name) {
                        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
                    }
                }
                if (cookies.length) cleared.push(`${cookies.length} cookie(s) JS`);
            } catch {
                /* noop */
            }
            try {
                const n = window.sessionStorage?.length ?? 0;
                window.sessionStorage?.clear();
                if (n) cleared.push("sessionStorage");
            } catch {
                /* noop */
            }
        }
        if (doCache && "caches" in window) {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
                if (keys.length) cleared.push(`${keys.length} cache(s) SW`);
            } catch {
                /* noop */
            }
        }
        return { ok: true, cleared };
    } catch {
        return { ok: false, cleared };
    }
}

/** Suscripcion Realtime a la fila de configuracion del usuario. SSR-safe. */
export function onSettingsChange(cb: (s: BrowserSettings) => void): () => void {
    if (typeof window === "undefined") return () => {};
    return onTableChange(TABLE, { event: "*" }, (payload: RealtimePayload) => {
        const type = payload?.eventType;
        if (type === "DELETE") {
            cb(defaultSettings());
            return;
        }
        cb(normalizeSettings(payload?.new ?? null));
    });
}
