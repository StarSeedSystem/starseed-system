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
import {
    SYNCED_KEYS,
    SYNCED_PREFIXES,
    SYNCED_PREFIX_EXCLUDE,
    isNeverSyncedKey,
    sanitizeForCloud,
    mergeLocalSecrets,
    isAuroraKey,
    isIntegrationConfigKey,
} from "@/lib/settings-sync";
// Config de sync por perfiles (Adenda 65 · SOP §10): gating de claves de
// ámbito perfil (p. ej. escritorios anclados a perfil) antes de push/aplicar.
// `shouldSyncKey` es la ÚNICA puerta: ya devuelve true para las claves de
// ámbito cuenta (como todas las de Aurora/Astraura, ver Adenda 68 · A).
import { shouldSyncKey } from "@/lib/sync/sync-profiles-config";
import { activeProfileId } from "@/lib/profiles/profiles";
// Adenda 69 · A: ÚNICA puerta de escritura a `user_settings.prefs`. Manda solo
// el parche y Postgres lo funde de forma atómica. Sustituye al `upsert` de la
// columna entera, que borraba las claves de los demás módulos (ver user-prefs.ts).
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

// ── Configuración ────────────────────────────────────────────────────────────
/** Toggle persistido (ON por defecto con sesión). */
export const REALTIME_SYNC_TOGGLE_KEY = "starseed.sync.realtime.v1";
/** Evento genérico despachado tras aplicar cambios remotos (además de los
 *  eventos concretos de cada store, ver EVENT_BY_KEY/EVENT_BY_PREFIX). */
export const SYNC_APPLY_EVENT = "starseed:sync:apply";
/** Evento de cambio de estado del motor (para paneles de Ajustes/Centro de Control). */
export const SYNC_STATUS_EVENT = "starseed:sync:status";
/**
 * Evento GENÉRICO de Aurora/Astraura (Adenda 68 · A): se despacha SIEMPRE que
 * llega de la cuenta un cambio de cualquier clave de Aurora/Astraura, además
 * de los eventos concretos que ya escucha cada panel. Sirve de red de
 * seguridad: una superficie nueva solo tiene que escuchar ESTE evento para
 * releer su config y estar viva en todos los dispositivos.
 */
export const AURORA_CONFIG_EVENT = "starseed:aurora-config-updated";

/**
 * Marcas de tiempo LWW por clave, LOCALES a este dispositivo (NO se sincroniza:
 * está en NEVER_SYNCED_KEYS). Guarda cuándo se escribió por última vez cada
 * clave EN ESTE dispositivo, para poder compararla con la marca que viaja en la
 * nube y no pisar nunca un cambio más nuevo.
 */
const LOCAL_META_KEY = "starseed.sync.meta.v1";
/** Sub-objeto reservado dentro de `user_settings.prefs` con las marcas LWW. */
const CLOUD_META_FIELD = "__meta";

const PUSH_DEBOUNCE_MS = 800;
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
    /** Marca LWW por clave (epoch ms). Ausente en emisores antiguos → se trata como 0. */
    meta?: Record<string, number>;
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
    "starseed.dock.items.v2": ["starseed:sync:apply"],
    "starseed.dock.folders.v1": ["starseed:sync:apply"],
    "starseed.library.installed.v1": ["starseed:library"],
    "starseed.library.mine.v1": ["starseed:library"],
    "starseed.library.published.v1": ["starseed:library"],
    "starseed.library.ratings.v1": ["starseed:library"],
    "starseed.library.usage.v1": ["starseed:library"],
    "starseed.neurons.prefs.v1": ["starseed:neurons"],
    "starseed.alarms.v1": ["starseed:alarms"],
    "starseed.tasks.quick.v1": ["starseed:tasks"],
    "starseed.notes.quick.v1": ["starseed:notes"],

    // ══════════════════════════════════════════════════════════════════════
    // AURORA / ASTRAURA (Adenda 68 · A) — ESTE era el agujero: las claves
    // estaban en SYNCED_KEYS (viajaban) pero NO en este mapa, así que al
    // aplicarse en el otro dispositivo NADIE se enteraba: el valor caía en
    // localStorage y los paneles seguían pintando lo viejo hasta recargar.
    // Cada clave se enlaza con el evento REAL que ya escucha su store.
    // ══════════════════════════════════════════════════════════════════════

    // Personalidades — personalities.ts (PERSONALITY_CHANGED_EVENT + estilo de voz)
    "starseed.aurora.personalities.v1": ["starseed:aurora-personality", "starseed:aurora-voice-style"],
    "starseed.aurora.personality.active.v1": ["starseed:aurora-personality", "starseed:aurora-voice-style"],

    // Centro de Configuración — setup-config.ts (AURORA_SETUP_EVENT)
    "starseed.aurora.setup.v1": ["starseed:aurora-setup"],
    "starseed.aurora.senses.v1": ["starseed:aurora-setup"],
    "starseed.aurora.persona-profiles.v1": ["starseed:aurora-setup"],
    "starseed.astraura.deploy.v1": ["starseed:aurora-setup", "starseed:neurons"],
    "starseed.astraura.scope.v1": ["starseed:aurora-setup"],

    // Voz — tts-oss/voice-config.ts (AURORA_VOICE_CONFIG_EVENT + AURORA_VOICE_STYLE_EVENT)
    "starseed.aurora.voice.v1": ["starseed:aurora-voice-config", "starseed:aurora-voice-style"],
    "starseed.aurora.oss-tts": ["starseed:aurora-oss-tts", "starseed:aurora-voice-config"],
    "starseed.aurora.oss-tts.voice": ["starseed:aurora-oss-tts", "starseed:aurora-voice-config"],

    // Escucha / STT — stt-oss/opt-in.ts + wake-word.ts + wake acústico
    "starseed.aurora.oss-stt": ["starseed:aurora-oss-stt"],
    "starseed.aurora.oss-stt.model": ["starseed:aurora-oss-stt"],
    "starseed.aurora.oss-stt.lang": ["starseed:aurora-oss-stt"],
    "starseed.aurora.always-on": ["starseed:aurora-always-on"],
    "starseed.aurora.wake.acoustic": ["starseed:aurora-wake-acoustic"],

    // Orbe, avatar, intro, canales
    "starseed.aurora.fab.enabled.v1": ["starseed:aurora-orb-fab", "starseed:aurora-orb-visibility"],
    "starseed.aurora.avatar.v1": ["starseed:aurora-avatar-config"],
    "starseed.aurora.intro.v1": ["starseed:aurora-setup"],
    "starseed.aurora.channels.v1": ["starseed:connectors"],

    // Astraura · inteligencia y contexto
    "starseed.astraura.intelligence.v1": ["starseed:astraura-intelligence", "starseed:astraura-route"],
    // Orden de preferencia de modelos IA (Adenda 129, model-preferences.ts): refresco en vivo entre dispositivos.
    "starseed.astraura.model-order.v1": ["starseed:model-prefs"],
    // Sistemas por neurona×personalidad (Adenda 149, neuron-persona-store.ts): refresco en vivo del panel.
    "starseed.astraura.neuron-persona.v1": ["starseed:astraura-neuron-persona"],
    "starseed.astraura.usercontext.v1": ["starseed:astraura-usercontext"],
    "starseed.astraura.installed-models.v1": ["starseed:astraura-installed-models"],
    "starseed.astraura.huggingbay-candidates.v1": ["starseed:astraura-huggingbay-candidates"],
    "starseed.astraura.webaccess.v1": ["starseed:astraura-suggestions"],

    // Capacidades/skills instaladas (espejo) — skills.ts
    "starseed.capabilities.v1": ["starseed:library"],

    // Modelos por función
    "starseed.ai.function-models.v1": ["starseed:astraura-intelligence"],
    "starseed.ai.nim-function-model.v1": ["starseed:astraura-intelligence"],

    // Hub de conectores (modo, NO credenciales)
    "starseed.connectors.mode.v1": ["starseed:connectors"],
};

/** Prefijo → evento(s); se usa cuando la clave concreta no está en EVENT_BY_KEY. */
const EVENT_BY_PREFIX: Array<{ prefix: string; events: string[] }> = [
    // Config de integraciones (global y por cerebro) — registry.ts la escucha.
    { prefix: "starseed.integration.", events: ["starseed:integration-config-changed"] },
    { prefix: "starseed.brain.", events: ["starseed:sync:apply"] },
];

function eventsForKey(key: string): string[] {
    const events = new Set<string>();
    const exact = EVENT_BY_KEY[key];
    if (exact) {
        for (const e of exact) events.add(e);
    } else {
        for (const { prefix, events: evts } of EVENT_BY_PREFIX) {
            if (key.startsWith(prefix)) {
                for (const e of evts) events.add(e);
                break;
            }
        }
    }
    // Config de integración por CEREBRO (`starseed.brain.<id>.integration.<x>`):
    // el prefijo genérico la captura antes, pero su panel escucha este evento.
    if (isIntegrationConfigKey(key)) events.add("starseed:integration-config-changed");
    // Red de seguridad: TODA clave de Aurora/Astraura despacha además el evento
    // genérico, aunque su store todavía no tenga uno propio (p. ej. visión).
    if (isAuroraKey(key)) events.add(AURORA_CONFIG_EVENT);
    return Array.from(events);
}

// ── Utilidades SSR-safe ──────────────────────────────────────────────────────
function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** ¿Esta clave está sincronizada? (clave exacta de SYNCED_KEYS, o prefijo dinámico permitido y no excluido). */
export function isSyncedKey(key: string): boolean {
    // PRIMERO la lista negra: un secreto o un estado de dispositivo nunca sale,
    // aunque coincida con SYNCED_KEYS o con un prefijo dinámico.
    if (isNeverSyncedKey(key)) return false;
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

/**
 * Lee `user_settings.prefs` de la cuenta. SOLO para COMPARAR (marcas LWW) o
 * para aplicar cambios remotos — nunca para reescribir la columna entera:
 * las escrituras van siempre por `mergeUserPrefs()` (Adenda 69). Nunca lanza:
 * sin red devuelve `{}` y seguimos local-first.
 */
async function readCloudPrefs(userId: string): Promise<Record<string, unknown>> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("user_settings")
            .select("prefs")
            .eq("user_id", userId)
            .maybeSingle();
        if (error) return {};
        if (data?.prefs && typeof data.prefs === "object") {
            return data.prefs as Record<string, unknown>;
        }
    } catch { /* sin red: local-first */ }
    return {};
}

/* ═══════════════════════════════════════════════════════════════════════════
 * LWW (last-write-wins) POR CLAVE — Adenda 68 · A
 * ═══════════════════════════════════════════════════════════════════════════
 * Antes, el push escribía `prefs[key] = valorLocal` a ciegas y el camino
 * postgres_changes aplicaba la fila ENTERA: un dispositivo con datos viejos
 * podía pisar un cambio más nuevo hecho en otro. Ahora cada clave lleva su
 * marca de tiempo (epoch ms) y solo gana la MÁS NUEVA.
 *
 *   · local  → `starseed.sync.meta.v1` en localStorage (NUNCA se sincroniza).
 *   · nube   → `user_settings.prefs.__meta` (sub-objeto reservado).
 *
 * Compatibilidad: las filas antiguas no tienen `__meta`. Una clave remota SIN
 * marca se trata como "desconocida" (ts 0): se aplica solo si aquí no hay nada
 * que perder (ver `shouldApplyRemote`), y el primer push de este dispositivo ya
 * la deja estampada para siempre.
 */

type MetaMap = Record<string, number>;

function readLocalMeta(): MetaMap {
    if (!isClient()) return {};
    try {
        const raw = localStorage.getItem(LOCAL_META_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const out: MetaMap = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
        }
        return out;
    } catch {
        return {};
    }
}

function writeLocalMeta(meta: MetaMap): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta));
    } catch { /* cuota: degradamos a "sin marca" (comportamiento antiguo) */ }
}

/** Sella una clave como escrita AHORA en este dispositivo. */
function touchLocalMeta(key: string, at = Date.now()): void {
    const meta = readLocalMeta();
    meta[key] = at;
    writeLocalMeta(meta);
}

/** Sella varias claves de golpe (una sola escritura). */
function touchLocalMetaMany(entries: MetaMap): void {
    if (Object.keys(entries).length === 0) return;
    const meta = readLocalMeta();
    for (const [k, v] of Object.entries(entries)) meta[k] = v;
    writeLocalMeta(meta);
}

/** Extrae el sub-objeto `__meta` de un `prefs` de la nube. */
function cloudMetaOf(prefs: Record<string, unknown> | null | undefined): MetaMap {
    const raw = prefs?.[CLOUD_META_FIELD];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: MetaMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
}

/**
 * ¿Debe aplicarse el valor REMOTO de esta clave?
 *   · Remoto MÁS NUEVO que local  → sí (es el caso normal).
 *   · Remoto MÁS VIEJO que local  → NO (nunca pisamos un cambio más reciente).
 *   · Empate exacto               → sí (idempotente: si el valor ya coincide,
 *                                   applyRemoteChanges no escribe nada).
 *   · Sin marca remota (fila antigua) → solo si aquí tampoco hay marca local o
 *                                   no existe la clave: si este dispositivo YA
 *                                   la ha tocado con marca, la nuestra manda y
 *                                   la subiremos para estampar la nube.
 */
function shouldApplyRemote(key: string, remoteTs: number, localMeta: MetaMap): boolean {
    const localTs = localMeta[key] ?? 0;
    if (remoteTs > 0) return remoteTs >= localTs;
    // Remoto sin marca (legado).
    if (localTs > 0) return false;               // aquí sí hay marca → lo nuestro es más fiable
    return localStorage.getItem(key) == null;    // no tenemos nada que perder
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

/**
 * Id del usuario. Adenda 69 · C — CAMINO RÁPIDO Y FIABLE:
 *
 * Antes esto llamaba SOLO a `auth.getUser()`, que es una petición de RED a
 * /auth/v1/user. En el arranque de la página (o con la red floja) esa llamada
 * tarda o falla, y el motor concluía "no hay sesión" AUNQUE la sesión estuviera
 * perfectamente guardada en la cookie. De ahí el "a veces tarda en restaurarse"
 * y el "parece que se ha cerrado la sesión" al recargar.
 *
 * `getSession()` lee la sesión de la cookie/almacenamiento local: es INSTANTÁNEA
 * y no depende de la red. La usamos primero; `getUser()` queda como respaldo
 * (p. ej. sesión presente pero aún sin hidratar en memoria).
 */
async function getUserId(): Promise<string | null> {
    try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const fromSession = sessionData?.session?.user?.id ?? null;
        if (fromSession) return fromSession;
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

/** Último instante (epoch ms) en que una clave de Aurora/Astraura viajó (subió o bajó). */
let lastAuroraSyncAt: number | null = null;

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
        // Lee prefs SOLO para comparar marcas LWW (no para reescribir la columna:
        // eso es justo lo que causaba el borrado — ver Adenda 69 y user-prefs.ts).
        const prefs = await readCloudPrefs(userId);

        const cloudMeta = cloudMetaOf(prefs);
        const localMeta = readLocalMeta();
        const changes: Record<string, unknown> = {};
        const changeMeta: MetaMap = {};
        const now = Date.now();
        let touchedAurora = false;

        for (const key of keys) {
            if (!isSyncedKey(key)) continue; // secretos y estado de dispositivo: fuera (defensa en profundidad)
            // Gating (SOP §10 + Adenda 68): `shouldSyncKey` decide por sí solo —
            // devuelve true para las claves de ámbito cuenta, aplica la config de
            // sync por perfiles a las de ámbito perfil (p. ej. starseed.desktops.v1)
            // y respeta el override por dispositivo de la sección 'aurora'.
            if (!shouldSyncKey(key, activeProfileId())) continue;
            const v = readLocal(key);
            if (v === undefined) continue;

            // La marca de la escritura local (si el parche de setItem la selló) o
            // ahora mismo (push forzado desde el botón "Sincronizar").
            const ts = localMeta[key] ?? now;
            // LWW también en la SUBIDA: si la nube ya tiene algo MÁS NUEVO que lo
            // nuestro, no lo pisamos (lo aplicaremos nosotros al recibirlo).
            if ((cloudMeta[key] ?? 0) > ts) continue;

            const safe = sanitizeForCloud(key, v); // ← el secreto (apiKey…) NO sube
            changes[key] = safe;
            changeMeta[key] = ts;
            if (isAuroraKey(key)) touchedAurora = true;
        }
        if (Object.keys(changes).length === 0) return;

        // ── ESCRITURA NO DESTRUCTIVA (Adenda 69 · A) ────────────────────────
        // Antes se subía la columna `prefs` ENTERA (leída arriba). Como otros
        // ~11 módulos hacen lo mismo a la vez al arrancar la página, el último
        // en escribir borraba lo de todos los demás: las claves de Aurora subían
        // bien y se ANIQUILABAN segundos después (medido en producción: la fila
        // pasó de 16 claves a 4). Ahora se manda SOLO el parche y Postgres lo
        // funde de forma atómica sobre la fila bloqueada.
        const res = await mergeUserPrefs(
            { ...changes, [CLOUD_META_FIELD]: changeMeta },
            { userId },
        );
        if (!res.ok) return;

        // Sella localmente lo que acabamos de subir (para futuras comparaciones).
        touchLocalMetaMany(changeMeta);
        setStatus({ state: "connected", lastChangeAt: Date.now(), lastKey: keys[keys.length - 1], lastFromDevice: deviceId() });
        if (touchedAurora) lastAuroraSyncAt = Date.now();

        // Broadcast inmediato para latencia mínima (no esperar el eco de postgres_changes).
        // Es el canal de CUENTA `acct:<uid>` — el mismo que multiplexa live-signal.ts.
        try {
            const channel = getOrCreateBroadcastChannel(userId);
            const payload: BroadcastPayload = { deviceId: deviceId(), changes, at: Date.now(), meta: changeMeta };
            await channel?.send({ type: "broadcast", event: "changes", payload });
        } catch { /* best-effort */ }

        // Señal en vivo estándar (live-signal) para quien prefiera suscribirse con
        // `onChange(AURORA_CONFIG_TOPIC)` en vez de escuchar eventos del DOM.
        // Import dinámico a propósito: live-signal importa de aquí (evita el ciclo).
        if (touchedAurora) {
            try {
                const live = await import("@/lib/sync/live-signal");
                await live.emitChange(live.AURORA_CONFIG_TOPIC, {
                    id: deviceId(),
                    updatedAt: String(now),
                    data: { keys: Object.keys(changes).filter(isAuroraKey) },
                });
            } catch { /* best-effort: el broadcast de arriba ya ha entregado el cambio */ }
        }
    } catch {
        /* best-effort: nunca romper la app por la nube */
    }
}

function scheduleLocalPush(key: string): void {
    if (wasJustAppliedRemote(key)) return; // eco del propio cambio remoto recién aplicado
    touchLocalMeta(key); // sella el instante REAL de la escritura (no el del push)
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

/**
 * Aplica los cambios que llegan de la cuenta (otro dispositivo o el arranque).
 * `remoteMeta` trae las marcas LWW: una clave remota MÁS VIEJA que la local
 * NUNCA se aplica (ese era el riesgo real de pisar trabajo reciente).
 */
function applyRemoteChanges(
    changes: Record<string, unknown>,
    fromDevice: string | null,
    remoteMeta: MetaMap = {},
): void {
    if (!isClient()) return;
    const localMeta = readLocalMeta();
    const appliedKeys: string[] = [];
    const metaToStamp: MetaMap = {};
    let touchedAurora = false;

    for (const [key, value] of Object.entries(changes)) {
        if (key === CLOUD_META_FIELD) continue;      // el sub-objeto de marcas no es una preferencia
        if (!isSyncedKey(key)) continue;             // defensa en profundidad: nunca aplicar claves no permitidas
        // Gating (SOP §10 + Adenda 68): no aplicar un cambio remoto que la config
        // de sync por perfiles (o el override de la sección 'aurora' para este
        // tipo de dispositivo) excluya en ESTE dispositivo.
        if (!shouldSyncKey(key, activeProfileId())) continue;

        const remoteTs = remoteMeta[key] ?? 0;
        // ── LWW: no pisar nunca un cambio local más nuevo ──
        if (!shouldApplyRemote(key, remoteTs, localMeta)) continue;

        try {
            // La clave API vive solo en este dispositivo: al aplicar la config
            // remota (que viaja SIN secreto) la reinyectamos para no borrarla.
            const merged = mergeLocalSecrets(key, value, localStorage.getItem(key));
            const serialized = serializeForStorage(merged);
            if (localStorage.getItem(key) === serialized) {
                // Sin cambio real, pero sí adoptamos la marca remota (converge).
                if (remoteTs > 0) metaToStamp[key] = Math.max(remoteTs, localMeta[key] ?? 0);
                continue;
            }
            markAppliedRemote(key);
            localStorage.setItem(key, serialized);
            metaToStamp[key] = remoteTs > 0 ? remoteTs : Date.now();
            appliedKeys.push(key);
            if (isAuroraKey(key)) touchedAurora = true;
        } catch { /* clave individual ignorada */ }
    }

    touchLocalMetaMany(metaToStamp);
    if (appliedKeys.length === 0) return;

    setStatus({ lastChangeAt: Date.now(), lastKey: appliedKeys[appliedKeys.length - 1], lastFromDevice: fromDevice });
    if (touchedAurora) lastAuroraSyncAt = Date.now();

    // Evento genérico (cualquier UI puede escucharlo sin conocer el store concreto).
    try { window.dispatchEvent(new CustomEvent(SYNC_APPLY_EVENT, { detail: { keys: appliedKeys, fromDevice } })); } catch { /* noop */ }

    // Eventos concretos que cada store YA escucha (storage no se dispara en el propio documento).
    const dispatched = new Set<string>();
    for (const key of appliedKeys) {
        for (const evt of eventsForKey(key)) {
            if (evt === SYNC_APPLY_EVENT || dispatched.has(evt)) continue;
            dispatched.add(evt);
            try {
                // El evento genérico de Aurora lleva detalle (qué claves cambiaron).
                if (evt === AURORA_CONFIG_EVENT) {
                    window.dispatchEvent(
                        new CustomEvent(AURORA_CONFIG_EVENT, {
                            detail: { keys: appliedKeys.filter(isAuroraKey), fromDevice },
                        }),
                    );
                } else {
                    window.dispatchEvent(new Event(evt));
                }
            } catch { /* noop */ }
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
        broadcastChannel.on<BroadcastPayload>("broadcast", { event: "changes" }, (msg) => {
            const payload = msg?.payload as BroadcastPayload | undefined;
            if (!payload || payload.deviceId === deviceId()) return; // anti-eco
            applyRemoteChanges(payload.changes ?? {}, payload.deviceId, payload.meta ?? {});
        });
        // Re-cablea los eventos CUSTOM ya registrados vía onAccountBroadcast
        // (p. ej. 'live' de live-signal, o las peticiones de archivo a neuronas):
        // tras un teardown/cambio de sesión el canal es NUEVO y perdería sus
        // bindings, dejando a esos listeners sordos para siempre.
        for (const event of accountBroadcastListeners.keys()) {
            ensureAccountEventWiring(broadcastChannel, event);
        }
        broadcastChannel.subscribe();
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
                    // Las marcas LWW de `__meta` evitan que esta fila entera pise cambios más nuevos.
                    const prefsObj = prefs as Record<string, unknown>;
                    const remoteMeta = cloudMetaOf(prefsObj);
                    const changes: Record<string, unknown> = {};
                    for (const [key, value] of Object.entries(prefsObj)) {
                        if (isSyncedKey(key)) changes[key] = value;
                    }
                    applyRemoteChanges(changes, null, remoteMeta);
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

    // ── Suscripción a AUTH: se registra SIEMPRE y ANTES de mirar si hay sesión ──
    // Adenda 69 · C. Antes esto vivía al FINAL de la función, DESPUÉS del
    // `return` de "no-session". Consecuencia: si al arrancar la pestaña la sesión
    // todavía no estaba hidratada (cookie sin leer, red lenta, `getUser()` con
    // hipo), el motor se declaraba "sin sesión", se iba… y NUNCA se enteraba de
    // que la sesión aparecía un instante después, porque jamás llegaba a
    // suscribirse a `onAuthStateChange`. La sincronización quedaba MUERTA para
    // toda la vida de la pestaña, sin un solo error en consola. Ahora la
    // suscripción se registra siempre: en cuanto la sesión hidrata, el motor
    // arranca solo.
    ensureAuthSubscription();

    setStatus({ state: "connecting" });
    const userId = await getUserId();
    if (!userId) {
        setStatus({ state: "no-session" });
        return; // el listener de auth de arriba lo reintentará al hidratar la sesión
    }
    await connectForUser(userId);
}

/** Se suscribe (una sola vez) a los cambios de sesión: login, logout, cambio de cuenta y refresco. */
function ensureAuthSubscription(): void {
    if (authSub) return;
    try {
        const supabase = createClient();
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            const uid = session?.user?.id ?? null;
            if (uid) {
                // Sesión disponible: conecta si aún no lo estábamos, o si cambió la cuenta.
                if (uid !== currentUserId || !(postgresChannel || broadcastChannel)) {
                    void connectForUser(uid);
                }
            } else {
                teardownChannels();
                currentUserId = null;
                setStatus({ state: "no-session" });
            }
        });
        authSub = data.subscription;
    } catch { /* noop */ }
}

/** Conecta los canales de una cuenta y baja su configuración. Idempotente. */
async function connectForUser(userId: string): Promise<void> {
    if (currentUserId === userId && (postgresChannel || broadcastChannel)) {
        setStatus({ state: "connected" });
        return; // ya conectado a este usuario
    }
    if (currentUserId !== userId) teardownChannels();
    currentUserId = userId;
    subscribePostgresChanges(userId);
    getOrCreateBroadcastChannel(userId);

    // PULL DE ARRANQUE (Adenda 68 · A): sin esto el dispositivo solo veía los
    // cambios que ocurrían mientras estaba abierto — la config ya guardada en la
    // cuenta no bajaba NUNCA. Se hace en segundo plano: no bloquea el arranque.
    void pullAndApplyNow();
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

/* ═══════════════════════════════════════════════════════════════════════════
 * PULL DE ARRANQUE — Adenda 68 · A  ⬅ ESTE ERA EL AGUJERO PRINCIPAL
 * ═══════════════════════════════════════════════════════════════════════════
 * Hasta ahora `startRealtimeSync()` SOLO se suscribía a los canales: nunca
 * LEÍA `user_settings.prefs`. Consecuencia: un dispositivo que abría el OS (o
 * simplemente recargaba) jamás recibía la configuración ya guardada en la
 * cuenta — solo veía los cambios que ocurrieran MIENTRAS estaba abierto. Por
 * eso la config de Aurora "no se sincronizaba": subía bien, pero no bajaba.
 *
 * Ahora, al arrancar (y al reconectar/cambiar de sesión):
 *   1. Se descarga `prefs` + `__meta`.
 *   2. Se aplican SOLO las claves cuya marca remota es ≥ la local (LWW).
 *   3. Se re-suben las claves locales que la nube no tiene o tiene más viejas
 *      (reconciliación: el dispositivo que llega no pierde su trabajo).
 */
export async function pullAndApplyNow(): Promise<{ applied: number; pushedBack: number }> {
    const result = { applied: 0, pushedBack: 0 };
    if (!isClient()) return result;
    const userId = await getUserId();
    if (!userId) return result;

    const prefs = await readCloudPrefs(userId);

    const remoteMeta = cloudMetaOf(prefs);
    const localMeta = readLocalMeta();

    // 1) Bajar y aplicar (con LWW y anti-secreto ya dentro de applyRemoteChanges).
    const changes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(prefs)) {
        if (key === CLOUD_META_FIELD) continue;
        if (!isSyncedKey(key)) continue;
        changes[key] = value;
    }
    const before = new Set(Object.keys(changes).filter((k) => {
        try {
            return localStorage.getItem(k) !== serializeForStorage(changes[k]);
        } catch { return false; }
    }));
    applyRemoteChanges(changes, null, remoteMeta);
    result.applied = before.size;

    // 2) Reconciliar hacia arriba: lo que este dispositivo tiene y la nube no
    //    (o tiene más viejo). Sin esto, un dispositivo con config nueva que
    //    arranca tarde quedaría "mudo" hasta el siguiente cambio manual.
    const localBundle = collectAllSyncedLocal();
    const toPush: string[] = [];
    for (const key of Object.keys(localBundle)) {
        const remoteTs = remoteMeta[key] ?? 0;
        const localTs = localMeta[key] ?? 0;
        const missingInCloud = !(key in prefs);
        if (missingInCloud || localTs > remoteTs) toPush.push(key);
    }
    if (toPush.length > 0) {
        await pushChanges(userId, toPush);
        result.pushedBack = toPush.length;
    }
    return result;
}

/**
 * "Sincronizar ahora" honesto: baja lo de la cuenta (LWW) y sube lo de aquí.
 * Es lo que llama el botón del panel de /cuenta.
 */
export async function syncNow(): Promise<{ applied: number; pushedBack: number }> {
    const r = await pullAndApplyNow();
    await pushAllSyncedNow();
    return r;
}

/* ── Estado de Aurora/Astraura para la UI (honesto, sin fingir) ───────────── */

export interface AuroraSyncSummary {
    /** Cuántas claves de Aurora/Astraura están hoy EN ESTE dispositivo y sincronizan. */
    keysLocal: number;
    /** Instante del último viaje (subida o bajada) de una clave de Aurora. */
    lastSyncAt: number | null;
    /** Estado del motor (mismo que el general). */
    state: RealtimeSyncState;
}

/** Resumen REAL del estado de sincronización de Aurora/Astraura. Nunca lanza. */
export function getAuroraSyncSummary(): AuroraSyncSummary {
    let keysLocal = 0;
    if (isClient()) {
        try {
            for (const key of Object.keys(collectAllSyncedLocal())) {
                if (isAuroraKey(key)) keysLocal += 1;
            }
        } catch { /* noop */ }
    }
    return { keysLocal, lastSyncAt: lastAuroraSyncAt, state: status.state };
}
