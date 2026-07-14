"use client";

/*
 * sync-profiles-config — CONFIGURACIÓN DE SYNC POR PERFILES (SOP §10).
 * ═══════════════════════════════════════════════════════════════════════════
 * Controla qué PERFILES de la cuenta participan en la sincronización de
 * secciones de ámbito perfil (p. ej. escritorios anclados a perfil,
 * ver src/lib/sync/profile-desktops.ts) y permite overrides inteligentes
 * por TIPO de dispositivo (web/pwa/standalone/móvil) — p. ej. un móvil puede
 * excluir secciones pesadas.
 *
 * Persistencia: user_settings.prefs['starseed.sync.profiles.v1']
 *   { mode: 'all' | 'selected', profiles: string[] (ids de os_account_profiles),
 *     perDevice: { [kind in DeviceKindSync]?: { enabled: boolean; sections?: string[] } } }
 *
 * DEFECTO: mode:'all' (todos los perfiles de la cuenta sincronizan).
 * Viaja con la cuenta como cualquier otra clave de settings-sync.ts.
 *
 * Este módulo NO decide el push/pull en sí — expone `shouldSyncKey(key)` y
 * `shouldSyncProfileScope(profileId)` que realtime-sync.ts consulta antes de
 * aplicar/enviar cambios de ámbito perfil (edición acotada, ver ese archivo).
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

export const SYNC_PROFILES_CONFIG_KEY = "starseed.sync.profiles.v1";
export const SYNC_PROFILES_CONFIG_EVENT = "starseed:sync-profiles-config";

/** Tipo de dispositivo para overrides (distinto de NeuronKind: enfocado en el modo de entrega web). */
export type DeviceKindSync = "web" | "pwa" | "standalone" | "mobile";

/** Secciones de ámbito perfil conocidas (extensible; usado por los overrides por dispositivo). */
export const PROFILE_SCOPE_SECTIONS = ["desktops", "library-brains", "aurora"] as const;
export type ProfileScopeSection = (typeof PROFILE_SCOPE_SECTIONS)[number];

/** Claves de `user_settings.prefs` que son de ÁMBITO PERFIL (se gatean con esta config
 *  antes de que realtime-sync.ts las empuje/aplique). Aditivo: ampliar sin migración. */
export const PROFILE_SCOPED_KEYS = ["starseed.desktops.v1"] as const;

/* ═══════════════════════════════════════════════════════════════════════════
 * AURORA / ASTRAURA — ÁMBITO CUENTA (decisión de la Adenda 68 · A)
 * ═══════════════════════════════════════════════════════════════════════════
 * TODO lo de Aurora/Astraura (personalidades, perfiles de personalidad, sentidos,
 * voz, visión, permisos, reparto de Astraura, ámbito, conectores…) es de ÁMBITO
 * CUENTA, no de perfil: es la MISMA Aurora en cualquier neurona, dispositivo o
 * perfil de la cuenta. Es lo que pidió el usuario y es coherente con el modelo
 * de Exocórtex (CLAUDE.md §3 · Ciberdelia): la IA personal pertenece a la
 * PERSONA (la Cuenta), no a una de sus facetas públicas (los Perfiles).
 *
 * Por eso NO están en PROFILE_SCOPED_KEYS: no se gatean por perfil activo y
 * viajan siempre. Lo que sí se permite es un ÚNICO override deliberado: apagar
 * la sección `aurora` para un TIPO de dispositivo concreto (p. ej. que un móvil
 * compartido no reciba las personalidades). Sin override → sincroniza todo, que
 * es el comportamiento por defecto y el que espera el usuario.
 *
 * Lo que NUNCA viaja son los SECRETOS (claves API, credenciales): eso no es
 * "ámbito", es la regla de Identidad Soberana — ver settings-sync.ts
 * (NEVER_SYNCED_KEYS + sanitizeForCloud).
 */

/** ¿Es una clave de configuración de Aurora/Astraura (ámbito cuenta)? */
export function isAuroraScopedKey(key: string): boolean {
    return (
        key.startsWith("starseed.aurora.") ||
        key.startsWith("starseed.astraura.") ||
        key === "starseed.capabilities.v1" ||
        key.startsWith("starseed.integration.")
    );
}

export interface DeviceOverride {
    enabled: boolean;
    /** Secciones concretas permitidas en este tipo de dispositivo; ausente = todas. */
    sections?: ProfileScopeSection[];
}

export interface SyncProfilesConfig {
    mode: "all" | "selected";
    /** ids de os_account_profiles incluidos cuando mode==='selected'. */
    profiles: string[];
    perDevice: Partial<Record<DeviceKindSync, DeviceOverride>>;
}

export function defaultSyncProfilesConfig(): SyncProfilesConfig {
    return { mode: "all", profiles: [], perDevice: {} };
}

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function normalize(raw: unknown): SyncProfilesConfig {
    if (!raw || typeof raw !== "object") return defaultSyncProfilesConfig();
    const r = raw as Record<string, unknown>;
    const mode = r.mode === "selected" ? "selected" : "all";
    const profiles = Array.isArray(r.profiles) ? r.profiles.filter((p): p is string => typeof p === "string") : [];
    const perDeviceRaw = r.perDevice && typeof r.perDevice === "object" ? (r.perDevice as Record<string, unknown>) : {};
    const perDevice: Partial<Record<DeviceKindSync, DeviceOverride>> = {};
    for (const kind of ["web", "pwa", "standalone", "mobile"] as DeviceKindSync[]) {
        const v = perDeviceRaw[kind];
        if (v && typeof v === "object") {
            const vv = v as Record<string, unknown>;
            const sections = Array.isArray(vv.sections)
                ? vv.sections.filter((s): s is ProfileScopeSection => PROFILE_SCOPE_SECTIONS.includes(s as ProfileScopeSection))
                : undefined;
            perDevice[kind] = { enabled: vv.enabled !== false, ...(sections ? { sections } : {}) };
        }
    }
    return { mode, profiles, perDevice };
}

/** Lectura local inmediata (localStorage), tolerante y SSR-safe. */
export function readSyncProfilesConfigLocal(): SyncProfilesConfig {
    if (!isClient()) return defaultSyncProfilesConfig();
    try {
        const raw = localStorage.getItem(SYNC_PROFILES_CONFIG_KEY);
        if (!raw) return defaultSyncProfilesConfig();
        return normalize(JSON.parse(raw));
    } catch {
        return defaultSyncProfilesConfig();
    }
}

function writeLocal(config: SyncProfilesConfig): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(SYNC_PROFILES_CONFIG_KEY, JSON.stringify(config));
    } catch {
        /* cuota / modo privado: degradamos en silencio */
    }
    try {
        window.dispatchEvent(new CustomEvent(SYNC_PROFILES_CONFIG_EVENT, { detail: config }));
    } catch {
        /* noop */
    }
    // El propio parche de setItem de realtime-sync.ts detecta esta clave (está
    // en SYNCED_KEYS) y agenda el push a la cuenta — no duplicamos esa lógica aquí.
}

/** Actualiza (merge parcial) la config y la persiste. */
export function setSyncProfilesConfig(patch: Partial<SyncProfilesConfig>): SyncProfilesConfig {
    const current = readSyncProfilesConfigLocal();
    const next: SyncProfilesConfig = {
        mode: patch.mode ?? current.mode,
        profiles: patch.profiles ?? current.profiles,
        perDevice: patch.perDevice ?? current.perDevice,
    };
    writeLocal(next);
    return next;
}

/** Fija el override de un tipo de dispositivo concreto (merge). */
export function setDeviceOverride(kind: DeviceKindSync, override: Partial<DeviceOverride>): SyncProfilesConfig {
    const current = readSyncProfilesConfigLocal();
    const merged: DeviceOverride = { enabled: true, ...(current.perDevice[kind] ?? {}), ...override };
    return setSyncProfilesConfig({ perDevice: { ...current.perDevice, [kind]: merged } });
}

/* ─────────────────────────── Detección del tipo de dispositivo ─────────────────────────── */

/** Detecta el tipo de dispositivo actual para aplicar overrides (web/pwa/standalone/móvil). Nunca lanza. */
export function detectDeviceKindSync(): DeviceKindSync {
    if (typeof navigator === "undefined") return "web";
    try {
        const ua = navigator.userAgent || "";
        const isMobileUa = /android|iphone|ipod|ipad|mobile/i.test(ua);
        const isStandalone =
            (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches === true) ||
            (navigator as unknown as { standalone?: boolean }).standalone === true;
        if (isStandalone && isMobileUa) return "mobile";
        if (isStandalone) return "standalone";
        if (isMobileUa) return "mobile";
        return "web";
    } catch {
        return "web";
    }
}

/* ─────────────────────────── Helpers de gating (consumidos por realtime-sync.ts) ─────────────────────────── */

/** ¿Esta clave de user_settings.prefs es de ámbito PERFIL (requiere gating por perfil activo)? */
export function isProfileScopedKey(key: string): boolean {
    return (PROFILE_SCOPED_KEYS as readonly string[]).includes(key);
}

/**
 * ¿Debe sincronizarse el ámbito perfil `profileId` bajo la config actual?
 * mode='all' ⇒ siempre true. mode='selected' ⇒ solo si está en `profiles`.
 * Sin profileId (aún no hay perfil activo resuelto) ⇒ true (no bloquea por defecto).
 */
export function shouldSyncProfileScope(profileId: string | null | undefined, config?: SyncProfilesConfig): boolean {
    const cfg = config ?? readSyncProfilesConfigLocal();
    if (cfg.mode === "all") return true;
    if (!profileId) return true;
    return cfg.profiles.includes(profileId);
}

/**
 * ¿Esta SECCIÓN de ámbito perfil está habilitada en ESTE tipo de dispositivo?
 * Sin override para el tipo detectado ⇒ true (todo activo por defecto).
 */
export function isSectionEnabledOnThisDevice(section: ProfileScopeSection, config?: SyncProfilesConfig): boolean {
    const cfg = config ?? readSyncProfilesConfigLocal();
    const kind = detectDeviceKindSync();
    const override = cfg.perDevice[kind];
    if (!override) return true;
    if (!override.enabled) return false;
    if (!override.sections || override.sections.length === 0) return true;
    return override.sections.includes(section);
}

/**
 * Gate combinado que consulta realtime-sync.ts antes de push/pull de una
 * clave de ámbito cuenta que resulta ser de ámbito perfil en la práctica
 * (p. ej. `starseed.desktops.v1`, que se ancla al perfil activo — ver
 * profile-desktops.ts). Para claves que NO son de ámbito perfil, siempre true
 * (el resto de SYNCED_KEYS no se ve afectado por esta config en absoluto).
 */
export function shouldSyncKey(key: string, activeProfileId: string | null): boolean {
    // Aurora/Astraura: ÁMBITO CUENTA. Sincroniza siempre, salvo que el usuario
    // haya apagado a propósito la sección 'aurora' para ESTE tipo de dispositivo.
    if (isAuroraScopedKey(key)) {
        return isSectionEnabledOnThisDevice("aurora", readSyncProfilesConfigLocal());
    }
    if (!isProfileScopedKey(key)) return true;
    const cfg = readSyncProfilesConfigLocal();
    if (!shouldSyncProfileScope(activeProfileId, cfg)) return false;
    // `starseed.desktops.v1` ⇒ sección 'desktops' del override por dispositivo.
    return isSectionEnabledOnThisDevice("desktops", cfg);
}

/* ─────────────────────────── Hook reactivo ─────────────────────────── */

export function useSyncProfilesConfig(): {
    config: SyncProfilesConfig;
    update: (patch: Partial<SyncProfilesConfig>) => void;
    updateDevice: (kind: DeviceKindSync, override: Partial<DeviceOverride>) => void;
    deviceKind: DeviceKindSync;
} {
    const [config, setConfig] = useState<SyncProfilesConfig>(() => readSyncProfilesConfigLocal());
    const [deviceKind] = useState<DeviceKindSync>(() => detectDeviceKindSync());

    useEffect(() => {
        const onChange = () => setConfig(readSyncProfilesConfigLocal());
        window.addEventListener(SYNC_PROFILES_CONFIG_EVENT, onChange);
        window.addEventListener("starseed:sync:apply", onChange); // cambios remotos aplicados por realtime-sync.ts
        return () => {
            window.removeEventListener(SYNC_PROFILES_CONFIG_EVENT, onChange);
            window.removeEventListener("starseed:sync:apply", onChange);
        };
    }, []);

    const update = useCallback((patch: Partial<SyncProfilesConfig>) => {
        setConfig(setSyncProfilesConfig(patch));
    }, []);

    const updateDevice = useCallback((kind: DeviceKindSync, override: Partial<DeviceOverride>) => {
        setConfig(setDeviceOverride(kind, override));
    }, []);

    return { config, update, updateDevice, deviceKind };
}

/** Best-effort: ¿hay sesión StarSeed activa? (reutilizado por la UI para avisos). */
export async function hasSessionQuick(): Promise<boolean> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return !!data?.user;
    } catch {
        return false;
    }
}
