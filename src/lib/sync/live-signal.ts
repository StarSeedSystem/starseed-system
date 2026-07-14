"use client";

/*
 * live-signal — SEÑALES DE CAMBIO EN VIVO **sin DDL** (Adenda 63 §4).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PROBLEMA QUE RESUELVE
 * ---------------------
 * El sync en vivo del OS (Biblioteca, publicaciones…) se apoyaba en
 * `postgres_changes`, que SOLO funciona si la tabla está dentro de la
 * publicación `supabase_realtime`. Esa alta es DDL
 * (`supabase/migrations/20260711120000_realtime_publication.sql`) y no siempre
 * se puede aplicar (sin credenciales de gestión). Resultado: en un proyecto sin
 * la migración aplicada, el usuario NO veía los cambios en otros dispositivos.
 *
 * Esta capa hace que el sync funcione IGUAL DE BIEN sin esa migración usando
 * Realtime **BROADCAST** (canales), que no requiere DDL, ni publicación, ni
 * réplica lógica: es un bus de mensajes entre clientes conectados.
 *
 * CONTRATO DE CANALES
 * -------------------
 *   · `acct:<uid>`        — canal de CUENTA (ya existe y lo gestiona
 *                           realtime-sync.ts). Llega a los OTROS DISPOSITIVOS
 *                           de la misma cuenta. Reutilizamos su multiplexado
 *                           (`onAccountBroadcast` / `sendAccountBroadcast`) para
 *                           no abrir un segundo websocket al mismo topic.
 *   · `ent:<kind>:<id>`   — canal de ENTIDAD (grupo, página, comunidad, E.F.…).
 *                           Llega a OTRAS CUENTAS con acceso al recurso
 *                           compartido. Se abre solo cuando hace falta.
 *
 * Sobre ambos canales viaja UN ÚNICO evento de broadcast, `live`, con payload
 * `LiveChange` — el `topic` discrimina el recurso (ver helpers `libraryTopic`,
 * `feedTopic`, `entityFeedTopic`).
 *
 * ANTI-ECO
 * --------
 * 1. Los canales se crean con `broadcast: { self: false }` → el emisor nunca
 *    recibe su propio mensaje.
 * 2. Además, todo payload lleva `deviceId`: si llega un cambio de ESTE
 *    dispositivo (p. ej. desde otra pestaña del mismo navegador), se descarta.
 *
 * DOBLE PROCESADO (broadcast + postgres_changes)
 * ----------------------------------------------
 * Si algún día SÍ se aplica la migración, el MISMO cambio puede llegar por dos
 * vías (broadcast y postgres_changes) y por dos canales (cuenta y entidad).
 * `shouldProcessChange(changeKey(topic, id, updatedAt))` actúa de puerta única:
 * la PRIMERA vía que llegue procesa; las demás se descartan dentro de una
 * ventana de ~5 s. Ambos caminos DEBEN construir la clave con el mismo
 * `changeKey(...)` (mismo `id` y mismo `updatedAt` de la fila) para que la
 * deduplicación cruce transportes.
 *
 * Principios (CLAUDE.md): local-first, nunca lanza (un fallo de red jamás tira
 * la UI), SSR-safe (en el servidor todo es no-op).
 */

import { createClient } from "@/utils/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { deviceId } from "@/lib/sync/entity-state";
import { onAccountBroadcast, sendAccountBroadcast } from "@/lib/sync/realtime-sync";

// ── Constantes del contrato ──────────────────────────────────────────────────

/** Único evento de broadcast usado por esta capa (el `topic` del payload discrimina). */
export const LIVE_EVENT = "live";

/** Ventana de deduplicación entre transportes (broadcast ↔ postgres_changes). */
const DEDUPE_WINDOW_MS = 5_000;

/** Gracia antes de cerrar un canal de entidad sin suscriptores. */
const ENTITY_CHANNEL_GRACE_MS = 60_000;

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Entidad compartida (mismo vocabulario que `EntityKind` de entity-state). */
export interface LiveEntityRef {
    kind: string;
    id: string;
}

/** Payload que viaja por el broadcast. */
export interface LiveChange {
    /** Id único de ESTE cambio (fallback de dedupe cuando no hay id/updatedAt). */
    changeId: string;
    /** Dispositivo emisor (anti-eco). */
    deviceId: string;
    /** Tema del cambio (ver helpers de topic). */
    topic: string;
    /** Epoch ms de emisión. */
    at: number;
    /** Id del recurso que cambió (clave de dedupe cruzado con postgres_changes). */
    id?: string;
    /** `updated_at`/`created_at` de la fila (clave de dedupe cruzado). */
    updatedAt?: string;
    /** Datos libres para el consumidor (opcional; el patrón es "señal + repull"). */
    data?: Record<string, unknown>;
}

export interface EmitChangeOptions {
    /** Id del recurso (mismo valor que usará el camino postgres_changes). */
    id?: string;
    /** Marca temporal de la fila (mismo valor que usará postgres_changes). */
    updatedAt?: string;
    /** Datos libres (opcional). */
    data?: Record<string, unknown>;
    /** Si el recurso es COMPARTIDO: difunde también por `ent:<kind>:<id>`. */
    entity?: LiveEntityRef;
}

export interface OnChangeOptions {
    /** Escucha también el canal de entidad (cambios de OTRAS cuentas con acceso). */
    entity?: LiveEntityRef;
}

// ── Helpers de topic (contrato compartido emisor ↔ receptor) ────────────────

/** Biblioteca por entidad: `library:<kind>:<id>`. */
export function libraryTopic(ref: LiveEntityRef): string {
    return `library:${ref.kind}:${ref.id}`;
}

/** Feed genérico por clave de canal de UI: `feed:<channelKey>`. */
export function feedTopic(channelKey: string): string {
    return `feed:${channelKey || "global"}`;
}

/** Feed de una entidad/sección concreta: `feed:<entityType>:<entitySlug>`. */
export function entityFeedTopic(entityType: string, entitySlug: string): string {
    return `feed:${entityType}:${entitySlug}`;
}

/** Topic global de publicaciones (cualquier feed puede refrescarse con él). */
export const FEED_GLOBAL_TOPIC = "feed:global";

/**
 * Topic de CONFIGURACIÓN de Aurora/Astraura (Adenda 68 · A).
 * Viaja solo por el canal de CUENTA (`acct:<uid>`): la config de Aurora es
 * privada de la cuenta y NUNCA se difunde por canales de entidad.
 *
 * Lo emite `realtime-sync.ts` tras subir con éxito cualquier clave de Aurora
 * (personalidades, sentidos, voz, permisos, reparto de Astraura…). El payload
 * lleva `data.keys` con las claves que cambiaron; el patrón recomendado sigue
 * siendo "señal + releer", porque el propio motor ya ha escrito el valor nuevo
 * en localStorage antes de que este evento llegue a los listeners.
 *
 * Alternativa equivalente sin live-signal: escuchar el evento del DOM
 * `starseed:aurora-config-updated` (AURORA_CONFIG_EVENT de realtime-sync).
 */
export const AURORA_CONFIG_TOPIC = "aurora:config";

/**
 * Topic de CONVERSACIONES de IA (Adenda 69 · I-1) — Aurora ↔ Astraura AI.
 *
 * Viaja solo por el canal de CUENTA (`acct:<uid>`): una conversación con la IA
 * personal es privada de la cuenta y NUNCA se difunde por canales de entidad.
 *
 * Lo emite `src/lib/aurora/conversations.ts` tras escribir con éxito en la nube
 * (conversación nueva, renombrada, borrada, o mensaje nuevo). Es el camino
 * RÁPIDO (broadcast, ~inmediato); el camino REDUNDANTE es `postgres_changes`
 * sobre `aurora_conversations` / `astraura_messages` (ambas en la publicación
 * `supabase_realtime`). `shouldProcessChange()` deduplica entre los dos.
 *
 * `data`: `{ convId?: string; kind: "message" | "conversation" }`.
 */
export const AI_CHATS_TOPIC = "aurora:chats";

/**
 * Entidad "virtual" del feed global → canal compartido `ent:feed:global`.
 * Sin ella, el topic global solo viajaría por el canal de CUENTA y un feed
 * genérico nunca vería en vivo las publicaciones de OTRAS cuentas.
 * Por el canal solo viaja la SEÑAL (id + fecha), nunca el contenido: cada
 * cliente vuelve a consultar y RLS decide qué puede leer.
 */
export const FEED_GLOBAL_ENTITY: LiveEntityRef = { kind: "feed", id: "global" };

/** Nombre del canal Supabase de una entidad compartida. */
export function entityChannelName(entity: LiveEntityRef): string {
    return `ent:${entity.kind}:${entity.id}`;
}

// ── Deduplicación (broadcast ↔ postgres_changes ↔ canal cuenta/entidad) ─────

const seenChanges = new Map<string, number>();

function gcSeenChanges(now: number): void {
    if (seenChanges.size < 64) return; // barato: solo limpiamos cuando crece
    for (const [k, t] of seenChanges) {
        if (now - t > DEDUPE_WINDOW_MS) seenChanges.delete(k);
    }
}

/**
 * Clave canónica de un cambio. AMBOS transportes (broadcast y postgres_changes)
 * deben construirla igual para que la deduplicación funcione entre ellos.
 */
export function changeKey(topic: string, id?: string | null, updatedAt?: string | null): string {
    return `${topic}|${id ?? ""}|${updatedAt ?? ""}`;
}

/**
 * Puerta única: devuelve `true` la PRIMERA vez que se ve una clave y `false`
 * durante los siguientes ~5 s. Llamar justo ANTES de procesar un cambio.
 */
export function shouldProcessChange(key: string): boolean {
    if (!key) return true;
    const now = Date.now();
    gcSeenChanges(now);
    const seen = seenChanges.get(key);
    if (seen != null && now - seen < DEDUPE_WINDOW_MS) return false;
    seenChanges.set(key, now);
    return true;
}

function keyOf(payload: LiveChange): string {
    return payload.id || payload.updatedAt
        ? changeKey(payload.topic, payload.id, payload.updatedAt)
        : `chg:${payload.changeId}`;
}

// ── Registro de listeners por topic ─────────────────────────────────────────

type LiveListener = (change: LiveChange) => void;
const topicListeners = new Map<string, Set<LiveListener>>();

/** Punto de entrada COMÚN de todo mensaje recibido (canal de cuenta o de entidad). */
function dispatchLive(raw: unknown): void {
    const payload = raw as LiveChange | undefined;
    if (!payload || typeof payload.topic !== "string" || !payload.topic) return;
    // Anti-eco: nunca re-aplicamos lo que emitió este mismo dispositivo
    // (otra pestaña del mismo navegador comparte deviceId).
    if (payload.deviceId && payload.deviceId === deviceId()) return;
    // Doble procesado: cuenta + entidad + postgres_changes → una sola pasada.
    if (!shouldProcessChange(keyOf(payload))) return;
    const listeners = topicListeners.get(payload.topic);
    if (!listeners || listeners.size === 0) return;
    for (const cb of listeners) {
        try {
            cb(payload);
        } catch {
            /* un listener roto no debe tirar al resto */
        }
    }
}

// ── Canal de CUENTA (multiplexado sobre `acct:<uid>` de realtime-sync) ──────

let accountWired = false;

function ensureAccountWiring(): void {
    if (accountWired) return;
    accountWired = true;
    try {
        onAccountBroadcast(LIVE_EVENT, dispatchLive);
    } catch {
        accountWired = false; // reintentaremos en el próximo onChange
    }
}

// ── Canales de ENTIDAD (`ent:<kind>:<id>`) ─────────────────────────────────

interface EntityChannelEntry {
    channel: RealtimeChannel;
    subscribers: number;
    graceTimer: ReturnType<typeof setTimeout> | null;
}

const entityChannels = new Map<string, EntityChannelEntry>();

function ensureEntityChannel(name: string): RealtimeChannel | null {
    const existing = entityChannels.get(name);
    if (existing) {
        if (existing.graceTimer) {
            clearTimeout(existing.graceTimer);
            existing.graceTimer = null;
        }
        return existing.channel;
    }
    try {
        const supabase = createClient();
        const channel = supabase.channel(name, { config: { broadcast: { self: false } } });
        channel
            .on("broadcast", { event: LIVE_EVENT }, (msg: { payload?: unknown }) => dispatchLive(msg?.payload))
            .subscribe();
        entityChannels.set(name, { channel, subscribers: 0, graceTimer: null });
        return channel;
    } catch {
        return null;
    }
}

/** Cierra el canal si se queda sin suscriptores (con gracia, para no reabrir en cada navegación). */
function releaseEntityChannel(name: string): void {
    const entry = entityChannels.get(name);
    if (!entry || entry.subscribers > 0 || entry.graceTimer) return;
    entry.graceTimer = setTimeout(() => {
        const current = entityChannels.get(name);
        if (!current || current.subscribers > 0) return;
        entityChannels.delete(name);
        try {
            createClient().removeChannel(current.channel);
        } catch {
            /* limpieza best-effort */
        }
    }, ENTITY_CHANNEL_GRACE_MS);
}

// ── API pública ─────────────────────────────────────────────────────────────

function makeChangeId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {
        /* entorno sin crypto.randomUUID */
    }
    return `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * EMITE una señal de cambio. Llega:
 *   · a los otros dispositivos de la cuenta (canal `acct:<uid>`), y
 *   · si `opts.entity`, a las otras cuentas con acceso (canal `ent:<kind>:<id>`).
 *
 * Llamar SIEMPRE **después** de que la escritura en la nube haya tenido ÉXITO
 * (si no, anunciaríamos un cambio que nadie puede leer todavía).
 *
 * Nunca lanza. Sin sesión, el canal de cuenta es un no-op silencioso.
 */
export async function emitChange(topic: string, opts?: EmitChangeOptions): Promise<void> {
    if (typeof window === "undefined" || !topic) return;

    const payload: LiveChange = {
        changeId: makeChangeId(),
        deviceId: deviceId(),
        topic,
        at: Date.now(),
        id: opts?.id,
        updatedAt: opts?.updatedAt,
        data: opts?.data,
    };

    // Marca previa: si la publicación `supabase_realtime` SÍ está aplicada, el
    // postgres_changes de este mismo cambio también llegará a este dispositivo.
    // Al reservar ya la clave, ese eco no se procesa dos veces.
    try {
        shouldProcessChange(keyOf(payload));
    } catch {
        /* noop */
    }

    // 1) Canal de cuenta (reutiliza el websocket de realtime-sync).
    try {
        await sendAccountBroadcast(LIVE_EVENT, payload);
    } catch {
        /* best-effort */
    }

    // 2) Canal de entidad (recurso compartido con otras cuentas).
    if (opts?.entity) {
        try {
            const name = entityChannelName(opts.entity);
            const channel = ensureEntityChannel(name);
            releaseEntityChannel(name); // si solo emitimos, no dejamos el canal abierto para siempre
            await channel?.send({ type: "broadcast", event: LIVE_EVENT, payload });
        } catch {
            /* best-effort */
        }
    }
}

/**
 * SE SUSCRIBE a los cambios de un topic. Devuelve función de limpieza.
 *
 * · Ignora los eventos emitidos por el PROPIO dispositivo (anti-eco).
 * · Deduplica contra el resto de transportes (ver `shouldProcessChange`).
 * · Con `opts.entity` escucha además el canal de la entidad compartida, así que
 *   también recibe los cambios hechos por OTRAS cuentas con acceso.
 *
 * SSR-safe: en el servidor devuelve un no-op.
 */
export function onChange(topic: string, cb: LiveListener, opts?: OnChangeOptions): () => void {
    if (typeof window === "undefined" || !topic) return () => {};

    ensureAccountWiring();

    const listeners = topicListeners.get(topic) ?? new Set<LiveListener>();
    listeners.add(cb);
    topicListeners.set(topic, listeners);

    let entityName: string | null = null;
    if (opts?.entity) {
        const name = entityChannelName(opts.entity);
        if (ensureEntityChannel(name)) {
            entityName = name;
            const entry = entityChannels.get(name);
            if (entry) entry.subscribers += 1;
        }
    }

    return () => {
        const set = topicListeners.get(topic);
        if (set) {
            set.delete(cb);
            if (set.size === 0) topicListeners.delete(topic);
        }
        if (entityName) {
            const entry = entityChannels.get(entityName);
            if (entry) {
                entry.subscribers = Math.max(0, entry.subscribers - 1);
                releaseEntityChannel(entityName);
            }
        }
    };
}

// ── Diagnóstico honesto: ¿está la publicación al día? ───────────────────────
//
// El sync YA funciona por broadcast; esto es solo INFORMATIVO (para el panel de
// /cuenta). PostgREST no expone `pg_catalog`, así que en la mayoría de los
// proyectos el resultado honesto es "desconocido" — y eso NO es un problema.

/** Tablas clave del sync en vivo (las mismas de la migración pendiente). */
export const REALTIME_KEY_TABLES = [
    "entity_state",
    "os_posts",
    "user_settings",
    "os_profiles",
    "canvases",
    "os_spaces",
] as const;

export interface RealtimeTablesReport {
    /** ¿Pudimos LEER la publicación? `false` = desconocido (no hay permiso/vista). */
    known: boolean;
    /** Tablas confirmadas dentro de `supabase_realtime` (solo fiable si `known`). */
    present: string[];
    /** Tablas clave que NO están en la publicación (solo fiable si `known`). */
    missing: string[];
    checkedAt: number;
}

let cachedReport: RealtimeTablesReport | null = null;

/**
 * Comprueba si las tablas clave están en la publicación `supabase_realtime`.
 * Consulta ligera y OPCIONAL: si PostgREST no expone `pg_publication_tables`
 * (lo normal), devuelve `known: false` ("desconocido") sin ruido ni alarma.
 *
 * El resultado NO condiciona el sync: el broadcast funciona en cualquier caso.
 */
export async function checkRealtimeTables(force = false): Promise<RealtimeTablesReport> {
    const unknown: RealtimeTablesReport = { known: false, present: [], missing: [], checkedAt: Date.now() };
    if (typeof window === "undefined") return unknown;
    if (cachedReport && !force) return cachedReport;

    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("pg_publication_tables")
            .select("tablename")
            .eq("pubname", "supabase_realtime")
            .eq("schemaname", "public");

        if (error || !Array.isArray(data)) {
            cachedReport = unknown;
            return unknown;
        }

        const names = new Set(
            (data as Array<{ tablename?: string | null }>).map((row) => String(row?.tablename ?? "")),
        );
        const present: string[] = [];
        const missing: string[] = [];
        for (const table of REALTIME_KEY_TABLES) {
            if (names.has(table)) present.push(table);
            else missing.push(table);
        }
        cachedReport = { known: true, present, missing, checkedAt: Date.now() };
        return cachedReport;
    } catch {
        cachedReport = unknown;
        return unknown;
    }
}
