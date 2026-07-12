"use client";

/*
 * realtime-sync — Motor de SINCRONIZACIÓN EN TIEMPO REAL entre dispositivos
 * de la MISMA CUENTA (y base para grupos).
 * ═══════════════════════════════════════════════════════════════════════════
 * Escritorios, cursor, chats de Aurora, memorias/cerebros, dock, pizarras y
 * navegador, ajustes… se reflejan al instante en todos los dispositivos con
 * sesión StarSeed activa.
 *
 * SOP / fuente de verdad: architecture/libreria-biblioteca-sync.md §4.
 * Contrato reutilizado: src/lib/sync/entity-state.ts (deviceId(), no se
 * modifica). Claves reutilizadas: src/lib/settings-sync.ts (SYNCED_KEYS +
 * SYNCED_PREFIXES + SYNCED_PREFIX_EXCLUDE).
 *
 * Cómo funciona:
 *  1. PARCHE LOCAL — se envuelve `localStorage.setItem` UNA sola vez
 *     (idempotente, HMR-safe) para detectar escrituras de claves/prefijos
 *     sincronizados. Cada escritura agenda un push con debounce (1-2s).
 *     También se escucha el evento nativo `storage` (cambios desde OTRAS
 *     pestañas de este mismo dispositivo) para no perder esos cambios.
 *  2. PUSH — con sesión activa, se mezclan (merge no destructivo, igual que
 *     desktop-store.ts / library-sync.ts) las claves cambiadas dentro de
 *     `user_settings.prefs` y se hace upsert. Se etiqueta con deviceId()
 *     para que el resto de dispositivos sepan quién escribió.
 *  3. TIEMPO REAL — dos canales complementarios:
 *       a) `postgres_changes` sobre la propia fila de `user_settings` (fuente
 *          de verdad, algo más lenta pero fiable — sobrevive reconexiones).
 *       b) canal broadcast `acct:<uid>` con payload {deviceId, changes}: el
 *          push también emite un broadcast inmediatamente tras el upsert
 *          para latencia mínima (no espera el eco de postgres_changes).
 *     En ambos casos, si el cambio lo originó ESTE dispositivo (mismo
 *     deviceId) se IGNORA (anti-eco: nunca re-aplicamos ni re-empujamos
 *     nuestro propio cambio).
 *  4. APLICAR REMOTO — al recibir un cambio de OTRO dispositivo: se escribe
 *     en localStorage con un flag anti-eco activo (para que el propio parche
 *     de setItem no vuelva a agendar un push), y se despachan eventos para
 *     que la UI se actualice en vivo:
 *       · CustomEvent 'starseed:sync:apply' { keys: string[] } — genérico.
 *       · Los eventos CONCRETOS que cada store ya escucha en su propio
 *         documento (storage NO se dispara en la misma pestaña), p. ej.
 *         'starseed:desktops', 'starseed:cursorfx', 'starseed:aurora-chatlog'…
 *         (ver EVENT_BY_KEY / EVENT_BY_PREFIX más abajo).
 *
 * Principios (CLAUDE.md · Identidad Soberana + Privacidad↔Transparencia):
 *  - Local-first: sin sesión o sin tabla, el motor no hace nada (no rompe).
 *  - Nunca lanza: todo try/catch: un fallo de red jamás debe tirar la UI.
 *  - Privacidad: solo viajan las claves/prefijos de settings-sync.ts (las
 *    claves API/secretos quedan siempre fuera, igual que en settings-sync).
 *  - Aditivo: no reemplaza push/pull manual de account-sync-panel.tsx ni los
 *    respaldos propios de desktop-store.ts/library-sync.ts — coexiste con
 *    ellos (mismo jsonb `prefs`, distintas claves; merge no destructivo).
 */

import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { deviceId } from "@/lib/sync/entity-state";
import { SYNCED_KEYS, SYNCED_PREFIXES, SYNCED_PREFIX_EXCLUDE } from "@/lib/settings-sync";
// Config de sync por perfiles (Adenda 65 · SOP §10): gating de claves de
// ámbito perfil (p. ej. escritorios anclados a perfil) antes de push/aplicar.
import { isProfileScopedKey, shouldSyncKey } from "@/lib/sync/sync-profiles-config";
import { activeProfileId } from "@/lib/profiles/profiles";

// ── Configuración ────────────────────────────────────────────────────────────
/** Toggle persistido (ON por defecto con sesión). */
export const REALTIME_SYNC_TOGGLE_KEY = "starseed.sync.realtime.v1";
/** Evento genérico despachado tras aplicar cambios remotos (además de los
 *  eventos concretos de cada store, ver EVENT_BY_KEY/EVENT_BY_PREFIX). */
export const SYNC_APPLY_EVENT = "starseed:sync:apply";
/** Evento de cambio de estado del motor (para paneles de Ajustes/Centro de Control). */
export const SYNC_STATUS_EVENT = "starseed:sync:status";

const PUSH_DEBOUNCE_MS = 1500;
const SELF_ECHO_WINDOW_MS = 4000;

// ── Tipos ────────────────────────────────────────────────────────────────────
export type RealtimeSyncState = "idle" | "connecting" | "connected" | "error" | "disabled" | "no-session";

export interface RealtimeSyncStatus {
    state: RealtimeSyncState;
    /** Epoch ms del último cambio aplicado o subido, o null si ninguno esta sesión. */
    lastChangeAt: number | null;
    /** Última clave que cambió (informativa). */
    lastKey: string | null;
    /** Dispositivo de origen del último cambio remoto aplicado (informativo). */
    lastFromDevice: string | null;
    /** deviceId de este dispositivo. */
    deviceId: string;
}

type StatusListener = (status: RealtimeSyncStatus) => void;

interface BroadcastPayload {
    deviceId: string;
    changes: Record<string, unknown>;
    at: number;
}

// ── Mapeo clave → evento(s) concretos que cada store ya escucha ─────────────
// (storage NO se dispara en el propio documento; hay que replicar el evento
// custom que cada store usa para refrescar su UI en la MISMA pestaña).
const EVENT_BY_KEY: Record<string, string[]> = {
    "starseed.desktops.v1": ["starseed:desktops"],
    "starseed.cursorfx.v1": ["starseed:cursorfx"],
    "starseed.aurora.chatlog.v1": ["starseed:aurora-chatlog"],
    "starseed.aurora.orb.pos.v1": ["starseed:aurora-orb-visibility"],
    "starseed.perf.v1": ["starseed:perf-changed"],
    "starseed.dock.items.v1": ["starseed:sync:apply"],
    "starseed.dock.folders.v1": ["starseed:sync:apply"],
    "starseed.library.installed.v1": ["starseed:library"],
    "starseed.library.mine.v1": ["starseed:library"],
    "starseed.library.published.v1": ["starseed:library"],
    "starseed.library.ratings.v1": ["starseed:library"],
    "starseed.library.usage.v1": ["starseed:library"],
    "starseed.neurons.prefs.v1": ["starseed:neurons"],
    "starseed.astraura.intelligence.v1": ["starseed:astraura-intelligence"],
    "starseed.alarms.v1": ["starseed:alarms"],
    "starseed.tasks.quick.v1": ["starseed:tasks"],
    "starseed.notes.quick.v1": ["starseed:notes"],
};
/** Prefijo → evento(s); se usa cuando la clave concreta no está en EVENT_BY_KEY. */
const EVENT_BY_PREFIX: Array<{ prefix: string; events: string[] }> = [
    { prefix: "starseed.brain.", events: ["starseed:sync:apply"] },
];

function eventsForKey(key: string): string[] {
    if (EVENT_BY_KEY[key]) return EVENT_BY_KEY[key];
    for (const { prefix, events } of EVENT_BY_PREFIX) {
        if (key.startsWith(prefix)) return events;
    }
    return [];
}

// ── Utilidades SSR-safe ──────────────────────────────────────────────────────
function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** ¿Esta clave está sincronizada? (clave exacta de SYNCED_KEYS, o prefijo dinámico permitido y no excluido). */
export function isSyncedKey(key: string): boolean {
    if ((SYNCED_KEYS as readonly string[]).includes(key)) return true;
    for (const excluded of SYNCED_PREFIX_EXCLUDE) {
        if (key.startsWith(excluded)) return false;
    }
    for (const prefix of SYNCED_PREFIXES) {
        if (key.startsWith(prefix)) return true;
    }
    return false;
}

function readLocal(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        if (raw == null) return undefined;
        try { return JSON.parse(raw); } catch { return raw; }
    } catch {
        return undefined;
    }
}

/** Recorre TODO localStorage y agrupa por clave sincronizada (fijas + prefijos). Nunca lanza. */
function collectAllSyncedLocal(): Record<string, unknown> {
    const bundle: Record<string, unknown> = {};
    if (!isClient()) return bundle;
    try {
        for (const key of SYNCED_KEYS) {
            const v = readLocal(key);
            if (v !== undefined) bundle[key] = v;
        }
        const len = localStorage.length;
        for (let i = 0; i < len; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            if ((SYNCED_KEYS as readonly string[]).includes(key)) continue; // ya cubierta arriba
            if (!isSyncedKey(key)) continue;
            const v = readLocal(key);
            if (v !== undefined) bundle[key] = v;
        }
    } catch { /* defensivo */ }
    return bundle;
}

async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

// ── Toggle persistido ────────────────────────────────────────────────────────
/** ¿El usuario tiene activada la sincronización en tiempo real? ON por defecto. */
export function isRealtimeSyncEnabled(): boolean {
    if (!isClient()) return true;
    try {
        const raw = localStorage.getItem(REALTIME_SYNC_TOGGLE_KEY);
        if (raw == null) return true; // ON por defecto
        return raw === "on" || raw === "true";
    } catch {
        return true;
    }
}

/** Activa/desactiva la sincronización en tiempo real (persistido; reinicia el motor si ya estaba corriendo). */
export function setRealtimeSyncEnabled(enabled: boolean): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(REALTIME_SYNC_TOGGLE_KEY, enabled ? "on" : "off");
    } catch { /* noop */ }
    if (enabled) void startRealtimeSync();
    else stopRealtimeSync();
}

// ── Estado del motor (singleton de módulo; HMR-safe vía flag en window) ────
let status: RealtimeSyncStatus = {
    state: "idle",
    lastChangeAt: null,
    lastKey: null,
    lastFromDevice: null,
    deviceId: "server",
};
const statusListeners = new Set<StatusListener>();

function setStatus(patch: Partial<RealtimeSyncStatus>): void {
    status = { ...status, ...patch };
    for (const cb of statusListeners) {
        try { cb(status); } catch { /* noop: un listener roto no debe tirar al resto */ }
    }
    try { window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: status })); } catch { /* noop */ }
}

/** Estado actual del motor (snapshot). */
export function getRealtimeSyncStatus(): RealtimeSyncStatus {
    return status;
}

/** Se suscribe a cambios de estado del motor. Devuelve función de limpieza. */
export function onRealtimeSyncStatus(cb: StatusListener): () => void {
    statusListeners.add(cb);
    try { cb(status); } catch { /* noop */ }
    return () => statusListeners.delete(cb);
}

// ── Núcleo: push (merge no destructivo sobre user_settings.prefs) ──────────
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingKeys = new Set<string>();
/** Claves aplicadas remotamente hace poco: se ignoran si el parche de setItem
 *  las detecta de nuevo (evita re-push inmediato del valor que acabamos de
 *  recibir, sin necesitar bloquear el parche entero). */
const recentlyAppliedRemote = new Map<string, number>();

function markAppliedRemote(key: string): void {
    recentlyAppliedRemote.set(key, Date.now());
}

function wasJustAppliedRemote(key: string): boolean {
    const t = recentlyAppliedRemote.get(key);
    if (t == null) return false;
    const fresh = Date.now() - t < SELF_ECHO_WINDOW_MS;
    if (!fresh) recentlyAppliedRemote.delete(key);
    return fresh;
}

async function pushChanges(userId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
        const supabase = createClient();
        // Lee prefs actual para NO pisar otras claves (dashboards, library, desktops…).
        let prefs: Record<string, unknown> = {};
        try {
            const { data } = await supabase
                .from("user_settings")
                .select("prefs")
                .eq("user_id", userId)
                .maybeSingle();
            if (data?.prefs && typeof data.prefs === "object") {
                prefs = { ...(data.prefs as Record<string, unknown>) };
            }
        } catch { /* mezclamos sobre objeto vacío si no se pudo leer */ }

        const changes: Record<string, unknown> = {};
        for (const key of keys) {
            // Gating por perfil (SOP §10): una clave de ámbito perfil (p. ej.
            // starseed.desktops.v1) solo se empuja si la config de sync por
            // perfiles lo permite para el perfil activo de ESTE dispositivo.
            if (isProfileScopedKey(key) && !shouldSyncKey(key, activeProfileId())) continue;
            const v = readLocal(key);
            if (v === undefined) continue;
            prefs[key] = v;
            changes[key] = v;
        }
        if (Object.keys(changes).length === 0) return;

        const { error } = await supabase
            .from("user_settings")
            .upsert(
                { user_id: userId, prefs, updated_at: new Date().toISOString() },
                { onConflict: "user_id" },
            );
        if (error) return;

        setStatus({ state: "connected", lastChangeAt: Date.now(), lastKey: keys[keys.length - 1], lastFromDevice: deviceId() });

        // Broadcast inmediato para latencia mínima (no esperar el eco de postgres_changes).
        try {
            const channel = getOrCreateBroadcastChannel(userId);
            const payload: BroadcastPayload = { deviceId: deviceId(), changes, at: Date.now() };
            await channel?.send({ type: "broadcast", event: "changes", payload });
        } catch { /* best-effort */ }
    } catch {
        /* best-effort: nunca romper la app por la nube */
    }
}

function scheduleLocalPush(key: string): void {
    if (wasJustAppliedRemote(key)) return; // eco del propio cambio remoto recién aplicado
    pendingKeys.add(key);
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        const keys = Array.from(pendingKeys);
        pendingKeys = new Set();
        void (async () => {
            const userId = await getUserId();
            if (!userId) return;
            await pushChanges(userId, keys);
        })();
    }, PUSH_DEBOUNCE_MS);
}

// ── Aplicar cambios remotos a localStorage + eventos de UI en vivo ─────────
function serializeForStorage(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}

function applyRemoteChanges(changes: Record<string, unknown>, fromDevice: string | null): void {
    if (!isClient()) return;
    const appliedKeys: string[] = [];
    for (const [key, value] of Object.entries(changes)) {
        if (!isSyncedKey(key)) continue; // defensa en profundidad: nunca aplicar claves no permitidas
        // Gating por perfil (SOP §10): no aplicar un cambio remoto de ámbito
        // perfil si la config de sync por perfiles lo excluye en ESTE dispositivo.
        if (isProfileScopedKey(key) && !shouldSyncKey(key, activeProfileId())) continue;
        try {
            const serialized = serializeForStorage(value);
            if (localStorage.getItem(key) === serialized) continue; // sin cambio real
            markAppliedRemote(key);
            localStorage.setItem(key, serialized);
            appliedKeys.push(key);
        } catch { /* clave individual ignorada */ }
    }
    if (appliedKeys.length === 0) return;

    setStatus({ lastChangeAt: Date.now(), lastKey: appliedKeys[appliedKeys.length - 1], lastFromDevice: fromDevice });

    // Evento genérico (cualquier UI puede escucharlo sin conocer el store concreto).
    try { window.dispatchEvent(new CustomEvent(SYNC_APPLY_EVENT, { detail: { keys: appliedKeys, fromDevice } })); } catch { /* noop */ }

    // Eventos concretos que cada store YA escucha (storage no se dispara en el propio documento).
    const dispatched = new Set<string>();
    for (const key of appliedKeys) {
        for (const evt of eventsForKey(key)) {
            if (evt === SYNC_APPLY_EVENT || dispatched.has(evt)) continue;
            dispatched.add(evt);
            try { window.dispatchEvent(new Event(evt)); } catch { /* noop */ }
        }
    }
}

// ── Canal broadcast `acct:<uid>` ─────────────────────────────────────────────
let broadcastChannel: RealtimeChannel | null = null;
let broadcastUserId: string | null = null;

function getOrCreateBroadcastChannel(userId: string): RealtimeChannel | null {
    if (broadcastChannel && broadcastUserId === userId) return broadcastChannel;
    try {
        const supabase = createClient();
        if (broadcastChannel) { try { supabase.removeChannel(broadcastChannel); } catch { /* noop */ } }
        broadcastChannel = supabase.channel(`acct:${userId}`, { config: { broadcast: { self: false } } });
        broadcastUserId = userId;
        broadcastChannel
            .on<BroadcastPayload>("broadcast", { event: "changes" }, (msg) => {
                const payload = msg?.payload as BroadcastPayload | undefined;
                if (!payload || payload.deviceId === deviceId()) return; // anti-eco
                applyRemoteChanges(payload.changes ?? {}, payload.deviceId);
            })
            .subscribe();
        return broadcastChannel;
    } catch {
        return null;
    }
}

// ── Eventos CUSTOM sobre el MISMO canal `acct:<uid>` (multiplexado) ─────────
// Cualquier feature de la cuenta (p. ej. "solicitar archivo a esta neurona",
// ver src/lib/files/os-files.ts) puede emitir/escuchar su propio evento de
// broadcast reutilizando el canal ya gestionado aquí (creación/teardown/
// reconexión), en vez de abrir un segundo canal Supabase Realtime duplicado
// para el mismo topic `acct:<uid>`.
const accountBroadcastListeners = new Map<string, Set<(payload: unknown) => void>>();

function ensureAccountEventWiring(channel: RealtimeChannel, event: string): void {
    // Cada `event` custom se registra una sola vez por canal (Supabase permite
    // múltiples `.on()` con distinto `event` sobre la misma instancia).
    const key = `__wired_${event}`;
    if ((channel as unknown as Record<string, boolean>)[key]) return;
    channel.on("broadcast", { event }, (msg: { payload?: unknown }) => {
        const listeners = accountBroadcastListeners.get(event);
        if (!listeners || listeners.size === 0) return;
        for (const cb of listeners) {
            try { cb(msg?.payload); } catch { /* un listener roto no debe tirar al resto */ }
        }
    });
    (channel as unknown as Record<string, boolean>)[key] = true;
}

/**
 * Se suscribe a un evento CUSTOM de broadcast en el canal de cuenta
 * `acct:<uid>` (multiplexado sobre el mismo canal que usa el motor de sync).
 * Devuelve función de limpieza. Nunca lanza; sin sesión, no-op silencioso
 * hasta que haya usuario (reintenta en segundo plano).
 */
export function onAccountBroadcast(event: string, handler: (payload: unknown) => void): () => void {
    let cancelled = false;
    const listeners = accountBroadcastListeners.get(event) ?? new Set();
    listeners.add(handler);
    accountBroadcastListeners.set(event, listeners);

    (async () => {
        const userId = await getUserId();
        if (!userId || cancelled) return;
        const channel = getOrCreateBroadcastChannel(userId);
        if (channel) ensureAccountEventWiring(channel, event);
    })();

    return () => {
        cancelled = true;
        accountBroadcastListeners.get(event)?.delete(handler);
    };
}

/**
 * Emite un evento CUSTOM de broadcast en el canal de cuenta `acct:<uid>` del
 * usuario actual. Nunca lanza; sin sesión o sin canal disponible, no hace
 * nada (best-effort, como el resto del motor).
 */
export async function sendAccountBroadcast(event: string, payload: unknown): Promise<void> {
    try {
        const userId = await getUserId();
        if (!userId) return;
        const channel = getOrCreateBroadcastChannel(userId);
        if (channel) ensureAccountEventWiring(channel, event);
        await channel?.send({ type: "broadcast", event, payload });
    } catch {
        /* best-effort */
    }
}

// ── Suscripción postgres_changes sobre la propia fila de user_settings ──────
let postgresChannel: RealtimeChannel | null = null;

function subscribePostgresChanges(userId: string): void {
    try {
        const supabase = createClient();
        postgresChannel = supabase
            .channel(`us:${userId}`)
            .on(
                "postgres_changes",
                // "*" (no solo UPDATE): la primera escritura de un usuario nuevo
                // es un INSERT (upsert sin fila previa) — también debe propagarse.
                { event: "*", schema: "public", table: "user_settings", filter: `user_id=eq.${userId}` },
                (payload: { new?: Record<string, unknown> }) => {
                    const row = payload.new;
                    if (!row) return;
                    const prefs = row.prefs;
                    if (!prefs || typeof prefs !== "object") return;
                    // postgres_changes no nos dice el deviceId del escritor: aplicamos igualmente
                    // (idempotente — applyRemoteChanges no reescribe si el valor ya coincide, y si
                    // lo originó este dispositivo el valor local YA es igual, así que es un no-op).
                    const changes: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(prefs as Record<string, unknown>)) {
                        if (isSyncedKey(key)) changes[key] = value;
                    }
                    applyRemoteChanges(changes, null);
                },
            )
            .subscribe((subState: string) => {
                if (subState === "SUBSCRIBED") setStatus({ state: "connected" });
                else if (subState === "CHANNEL_ERROR" || subState === "TIMED_OUT") setStatus({ state: "error" });
            });
    } catch {
        setStatus({ state: "error" });
    }
}

// ── Parche seguro e idempotente de localStorage.setItem ─────────────────────
const PATCH_FLAG = "__STARSEED_REALTIME_SYNC_PATCHED__";

function patchLocalStorageOnce(): void {
    if (!isClient()) return;
    try {
        if ((window as unknown as Record<string, boolean>)[PATCH_FLAG]) return;
        const original = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function patchedSetItem(key: string, value: string): void {
            original(key, value);
            try {
                if (isSyncedKey(key) && !wasJustAppliedRemote(key)) scheduleLocalPush(key);
            } catch { /* nunca romper la escritura original por el hook de sync */ }
        };
        (window as unknown as Record<string, boolean>)[PATCH_FLAG] = true;
    } catch { /* si el entorno no permite parchear, degradamos a solo 'storage' + polling */ }
}

// ── Listener 'storage' (cambios desde OTRAS pestañas de este dispositivo) ──
function onStorageEvent(e: StorageEvent): void {
    if (!e.key) return; // e.key === null ⇒ localStorage.clear(): no hay clave concreta que reenviar
    if (!isSyncedKey(e.key)) return;
    scheduleLocalPush(e.key);
}

// ── Ciclo de vida del motor ──────────────────────────────────────────────────
let started = false;
let currentUserId: string | null = null;
let authSub: { unsubscribe: () => void } | null = null;

/**
 * Arranca el motor de sincronización en tiempo real. Idempotente: llamar
 * varias veces no duplica listeners ni canales. Sin sesión o con el toggle
 * desactivado, deja el estado en 'no-session'/'disabled' sin lanzar.
 */
export async function startRealtimeSync(): Promise<void> {
    if (!isClient()) return;
    setStatus({ deviceId: deviceId() });

    if (!isRealtimeSyncEnabled()) {
        setStatus({ state: "disabled" });
        return;
    }

    patchLocalStorageOnce();
    if (!started) {
        started = true;
        window.addEventListener("storage", onStorageEvent);
    }

    setStatus({ state: "connecting" });
    const userId = await getUserId();
    if (!userId) {
        setStatus({ state: "no-session" });
        return;
    }
    if (currentUserId === userId && (postgresChannel || broadcastChannel)) {
        setStatus({ state: "connected" });
        return; // ya conectado a este usuario
    }
    currentUserId = userId;
    subscribePostgresChanges(userId);
    getOrCreateBroadcastChannel(userId);

    // Reacciona a cambios de sesión (login/logout/cambio de cuenta) sin recargar la página.
    if (!authSub) {
        try {
            const supabase = createClient();
            const { data } = supabase.auth.onAuthStateChange((_event, session) => {
                const uid = session?.user?.id ?? null;
                if (uid && uid !== currentUserId) {
                    currentUserId = uid;
                    teardownChannels();
                    subscribePostgresChanges(uid);
                    getOrCreateBroadcastChannel(uid);
                } else if (!uid) {
                    teardownChannels();
                    currentUserId = null;
                    setStatus({ state: "no-session" });
                }
            });
            authSub = data.subscription;
        } catch { /* noop */ }
    }
}

function teardownChannels(): void {
    try {
        const supabase = createClient();
        if (postgresChannel) supabase.removeChannel(postgresChannel);
        if (broadcastChannel) supabase.removeChannel(broadcastChannel);
    } catch { /* noop */ }
    postgresChannel = null;
    broadcastChannel = null;
    broadcastUserId = null;
}

/** Detiene el motor (no desmonta el parche de setItem: es inocuo sin sesión/desactivado). */
export function stopRealtimeSync(): void {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    pendingKeys = new Set();
    teardownChannels();
    if (authSub) { try { authSub.unsubscribe(); } catch { /* noop */ } authSub = null; }
    currentUserId = null;
    if (isClient()) { try { window.removeEventListener("storage", onStorageEvent); } catch { /* noop */ } }
    started = false;
    setStatus({ state: "disabled" });
}

/**
 * Fuerza un push completo de TODAS las claves sincronizadas actualmente en
 * localStorage (fijas + prefijos dinámicos). Útil tras habilitar el motor o
 * para un botón "Sincronizar ahora". Nunca lanza.
 */
export async function pushAllSyncedNow(): Promise<void> {
    const userId = await getUserId();
    if (!userId) return;
    const bundle = collectAllSyncedLocal();
    await pushChanges(userId, Object.keys(bundle));
}
