"use client";

/*
 * settings-sync — Sincronización de preferencias con la cuenta StarSeed (StarSeed ID).
 * ----------------------------------------------------------------------------------
 * Lleva las preferencias locales (apariencia, dock, Trinity, memoria del Exocórtex)
 * a la cuenta soberana DEL OS (Supabase **`nxstilnyidvkqeosofuh`**), para que la
 * misma cuenta recupere su configuración en cualquier dispositivo.
 * ⚠️ Corregido el 2026-07-12: decía `dzkjapinnewkxzjltadv` y «la misma identidad
 * —Nexus, Café, OS—». FALSO: `dzkjapinnewkxzjltadv` es el proyecto de Nexus/Café;
 * sus cuentas NO son las del OS (CLAUDE.md §2).
 *
 * Principios (alineados con CLAUDE.md · Identidad Soberana e Invariantes):
 *  - ADITIVO Y OPT-IN: no cambia nada hasta que el usuario pulsa sincronizar.
 *    localStorage sigue siendo la fuente de verdad sin conexión.
 *  - TOLERANTE A FALLOS: si no hay sesión, o la tabla `user_settings` aún no
 *    existe, devuelve un resultado claro sin romper la app (nunca lanza).
 *  - DATOS DEL USUARIO, PROPIEDAD DEL USUARIO: solo su propia fila (RLS).
 *
 * Migración SQL requerida (documentada en el SOP, ejecutar una vez en Supabase):
 *   create table if not exists public.user_settings (
 *     user_id uuid primary key references auth.users(id) on delete cascade,
 *     prefs jsonb not null default '{}'::jsonb,
 *     updated_at timestamptz not null default now()
 *   );
 *   alter table public.user_settings enable row level security;
 *   create policy "own settings" on public.user_settings
 *     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */

import { createClient } from "@/utils/supabase/client";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";

/** Claves de preferencia que viajan con la cuenta. Aditivo: ampliar sin migración. */
export const SYNCED_KEYS = [
    "appearance-config-v2",      // apariencia completa (incluye tema del sistema + Trinity táctil)
    "starseed.dock.items.v2",    // OmniDock personalizado (v2 = clave real de dock-config.ts; la v1 nunca sincronizaba)
    "os.trinity.fab",            // visibilidad del botón Trinity
    "os.trinity.fab.pos",        // posición del botón Trinity
    "starseed_user_memory",      // memoria del Exocórtex (intereses/rasgos)
    // ── Astraura Intelligence (ola 2026-07): la MISMA inteligencia en OS,
    //    Nexus y Café, en todos los dispositivos de la cuenta. Las claves API
    //    NUNCA viajan (starseed.ai.providers queda local por diseño).
    "starseed.astraura.intelligence.v1", // modo auto/manual, overrides por tarea
    "starseed.oss.defaults.v1",          // servicio elegido por función/scope
    "starseed.ai.function-models.v1",    // preferencias de UI de modelos por función
    "starseed.neurons.prefs.v1",         // permisos/preferencias de neuronas (dispositivos)
    "starseed.library.installed.v1",     // paquetes instalados desde la Biblioteca
    "starseed.library.mine.v1",          // réplicas/forks editables del usuario (Cydia «Replicar»)
    "starseed.library.published.v1",     // ramas marcadas como públicas (preparadas para la red)
    "starseed.aurora.voice.v1",          // voz de Aurora: motor (navegador/Kokoro/Kitten) + voz elegida
    "starseed.aurora.vision.v1",             // visión de Aurora: activada + modelo elegido
    "starseed.astraura.installed-models.v1", // modelos de navegador instalados (opt-in) por el usuario
    "starseed.library.seed.v1",              // versión de defaults sembrados en la cuenta (biblioteca)
    "starseed.updates.seen.v1",              // avisos de actualización/instalación ya vistos por el usuario
    "starseed.library.ratings.v1",           // valoración local (estrellas) de paquetes de la Biblioteca
    "starseed.library.usage.v1",             // contador de uso (aperturas reales) de paquetes de la Biblioteca
    // ── Sincronización en tiempo real (Adenda 64 · realtime-sync.ts) ──────
    //    Secciones descubiertas por grep real en el código (ver SOP
    //    architecture/libreria-biblioteca-sync.md §4). Aditivo: el motor
    //    realtime-sync.ts empuja/aplica estas claves además de las de arriba.
    "starseed.desktops.v1",              // escritorios (iconos, ventanas, fondos, vista) — desktop-store.ts
    "starseed.cursorfx.v1",              // cursor personalizado + animaciones de clic — cursor-fx.tsx
    "starseed.aurora.chatlog.v1",        // registro de conversación con Aurora — aurora-chat-log.ts
    "starseed.dock.folders.v1",          // folders del OmniDock — dock-config.ts
    "starseed.aurora.orb.pos.v1",        // posición del orbe de Aurora en pantalla — aurora-orb-bus.ts
    "starseed.a11y.settings",            // accesibilidad (contraste, movimiento reducido…) — accessibility-settings.tsx
    "starseed.perf.v1",                  // modo de rendimiento auto/alto/eco — device-tier.ts
    // ── Perfiles múltiples + sync por perfiles (Adenda 65 · profiles.ts / sync-profiles-config.ts) ──
    "starseed.profile.active.v1",        // perfil activo en ESTE dispositivo (por dispositivo, pero viaja como respaldo)
    "starseed.sync.profiles.v1",         // config de sync por perfiles (modo todos/seleccionados + overrides por dispositivo)
    // ── THE HUGGING BAY (jul-2026 · huggingbay.ts / installed-models.ts) ──────
    //    `huggingBay` vive DENTRO de starseed.astraura.intelligence.v1 (ya
    //    sincronizado arriba); solo el registro de candidatos es una clave nueva.
    "starseed.astraura.huggingbay-candidates.v1", // modelos de Hugging Bay marcados "Usar en Astraura"
    // ── Contexto Total de Aurora (jul-2026 · ai/astraura/user-context.ts) ─────
    "starseed.astraura.usercontext.v1", // "Aurora conoce mi contexto" (on/off) + nivel por defecto (breve/completo)
    // ── Personalidades de Aurora (Adenda 63 · lib/aurora/personalities.ts) ────
    "starseed.aurora.personalities.v1",      // personalidades instaladas/creadas (archivos de configuración compartibles)
    "starseed.aurora.personality.active.v1", // asignaciones por contexto (global/sección/chat/cerebro)
    // ── Mapa del Hub (Adenda 63 · lib/map/*) ──────────────────────────────────
    "starseed.map.view.v1",     // vista del mapa (centro/zoom/capas activas)
    "starseed.map.location.v1", // compartición de ubicación (off/red/grupos-usuarios)
    // ── Aurora desde el arranque (2026-07-13) ─────────────────────────────────
    "starseed.aurora.fab.enabled.v1", // botón/orbe flotante de Aurora visible por defecto (ON) en todo el OS
    "starseed.aurora.intro.v1",       // onboarding de Aurora ya realizado (preguntas de preferencias)
    // ── Centro de Configuración de Aurora y Astraura (Adenda 67 · P1) ─────────
    "starseed.aurora.setup.v1",            // estado del centro de configuración (hecho / pospuesto)
    "starseed.aurora.senses.v1",           // config por sentido (motor/fuente/memoria/herramientas/tono)
    "starseed.aurora.persona-profiles.v1", // perfiles de personalidad (avatar, permisos, aprendizaje)
    "starseed.astraura.deploy.v1",         // qué habilidades/repos se instalan en cada neurona/cerebro/perfil
    "starseed.astraura.scope.v1",          // ámbito unificado de Astraura (cuenta/grupos/páginas/entidades)
    // ── Conectores de integraciones (Adenda 67 · P4 · ampliado en Adenda 68 A) ───
    //    Viajan enabled/endpoint/extra NO secreto. La CLAVE de cada servicio
    //    (`apiKey`, y los campos secretos de `extra`) se ELIMINA antes de subir
    //    (`sanitizeForCloud`) y se RESTAURA desde el dispositivo al aplicar
    //    (`mergeLocalSecrets`). ⚠️ Antes de la Adenda 68 esto NO era cierto: el
    //    objeto entero (con `apiKey` en claro) se subía a `user_settings.prefs`.
    // ── Audiomorphic (Adenda 69 · K): los presets del visualizador viajan con la
    //    cuenta (antes eran por dispositivo). Solo se guarda el diff con los
    //    valores por defecto, así que no engorda `prefs`.
    "starseed.audiomorphic.presets.v1",
    "starseed.integration.typesense",        // búsqueda (con caída a Supabase)
    "starseed.integration.postiz",           // publicación en redes (siempre con confirmación explícita)
    "starseed.integration.tencentdb-memory", // memoria de agente por gateway HTTP
    "starseed.integration.databasement",     // servidor de copias de seguridad de cuenta/cerebro/perfil
    "starseed.integration.openmanus",        // delegación de tareas a agentes
    "starseed.integration.penpot",           // diseño/lienzo por instancia
    "starseed.integration.opencut",          // edición de vídeo
    // ── Apps: notificaciones + auto-actualización (Adenda 69 J) ───────────────
    "starseed.apps.notify-prefs.v1",   // permiso de avisos/popups por app instalada (default ON)
    "starseed.library.autoupdate.v1",  // aplicar solas las actualizaciones de la Librería (opt-in)
    // ── Audiomorphic completo (Adenda 69 K): presets por cuenta ───────────────
    "starseed.audiomorphic.presets.v1", // presets guardados del visualizador Audiomorphic
    "starseed.integration.searxng",          // búsqueda web soberana de Aurora
    // ── Adenda 68 · A · SYNC TOTAL de Aurora/Astraura ────────────────────────
    //    Todo lo de Aurora/Astraura es de ÁMBITO CUENTA (decisión del usuario):
    //    la misma Aurora en cualquier neurona/dispositivo/perfil de la cuenta.
    "starseed.capabilities.v1",        // capacidades/skills ACTIVAS (espejo de lo instalado) — ai/astraura/skills.ts
    "starseed.aurora.avatar.v1",       // avatar y presencia visual de Aurora — ai/astraura/avatar-config.ts
    "starseed.aurora.channels.v1",     // canales de Aurora (chat interno, Telegram, Google Chat…) — lib/channels/telegram.ts
    "starseed.astraura.webaccess.v1",  // acceso web de Aurora (on/off + política) — ai/astraura/web-access.ts
    "starseed.aurora.always-on",       // escucha continua (wake word) — lib/aurora/wake-word.ts
    "starseed.aurora.autonomy",        // autonomía de voz de Aurora — lib/aurora/voice-autonomy.ts
    "starseed.aurora.wake.acoustic",   // wake acústico activado (la CLAVE Porcupine NUNCA viaja)
    "starseed.aurora.oss-tts",         // opt-in del TTS OSS — lib/aurora/tts-oss/opt-in.ts
    "starseed.aurora.oss-tts.voice",   // voz elegida del TTS OSS
    "starseed.aurora.oss-stt",         // opt-in del STT OSS (Whisper) — lib/aurora/stt-oss/opt-in.ts
    "starseed.aurora.oss-stt.model",   // modelo de Whisper elegido
    "starseed.aurora.oss-stt.lang",    // idioma del STT OSS
    "starseed.ai.nim-function-model.v1", // modelo por función (NIM) — ai/functions/function-models.ts
    // ── Alarmas funcionales (jul-2026 · lib/alarms/alarms.ts) ─────────────────
    "starseed.alarms.v1", // alarmas del usuario (mensajes/correos/invitaciones a eventos) + snooze/descarte
    // ── Hub de Conectores por usuario (jul-2026 · connector-credentials.ts) ───
    //    Preferencia de MODO (automático/preferir mi cuenta/solo gratis-OSS),
    //    global y por categoría. NO es secreta, así que SÍ viaja. Las
    //    CREDENCIALES en sí ('starseed.connectors.creds.v1') NUNCA se añaden
    //    aquí — quedan solo en este navegador, por diseño (igual que
    //    starseed.ai.providers más arriba).
    "starseed.connectors.mode.v1",
    // ── Catálogo de Temas + Mezclador (jul-2026 · theme-engine.ts / theme-mixer.ts) ──
    //    El tema aplicado y los temas personalizados (incl. mezclas guardadas
    //    como tema) viajan con la cuenta, igual que el resto de apariencia.
    "starseed.theme.applied.v1",
    "starseed.theme.custom.v1",
    // ── Widgets de Dashboard con datos propios persistentes (jul-2026 · sexta
    //    oleada de rediseño): tareas y notas rápidas viajan con la cuenta.
    "starseed.tasks.quick.v1",   // lib/tasks/quick-tasks.ts
    "starseed.notes.quick.v1",   // lib/notes/quick-notes.ts
    // ── Adenda 66 (2026-07-12): folders/permisos/publicaciones/red descentralizada ──
    "starseed.feed.prefs.v1",       // filtros/orden/vista de publicaciones por perfil+entorno (feed-filters.ts)
    "starseed.updates.history.v1",  // historial de actualizaciones de programas/repos (available-updates.ts)
    // ── Dashboard: versión de defaults (jul-2026 · dashboard-layout.tsx) ──────
    //    Marca qué generación de dashboards/widgets predeterminados ya
    //    re-sembró esta cuenta (DEFAULTS_VERSION). Los tableros/widgets en sí
    //    sincronizan por su propio canal dedicado en tiempo real
    //    (`dashboard_state`, ver lib/dashboard/dashboard-sync.ts); esta clave
    //    viaja AQUÍ TAMBIÉN (push/pull manual de ajustes) como canal de
    //    respaldo para que un dispositivo nuevo no dispare una re-siembra
    //    local espuria si la cuenta ya migró desde otro dispositivo.
    "starseed_defaults_version",
] as const;

/**
 * Prefijos de clave sincronizados DINÁMICAMENTE (número de sufijos variable,
 * p. ej. por id de cerebro): `starseed.brain.<id>.moa` / `.channels` /
 * `.memoryRoots` / `.library` (ver brains-panel.tsx). El motor
 * realtime-sync.ts descubre las claves reales presentes en localStorage bajo
 * estos prefijos y las trata igual que una clave de SYNCED_KEYS.
 *
 * EXCLUSIÓN EXPLÍCITA: `starseed.entitylib.` (Biblioteca por entidad) queda
 * FUERA — la gestiona su propia capa (entity-state.ts / entity-library.ts),
 * nunca este motor de cuenta. Ver SOP §3 vs §4.
 */
export const SYNCED_PREFIXES = [
    "starseed.brain.", // starseed.brain.<id>.{moa,channels,memoryRoots,library}
] as const;

/** Prefijos EXCLUIDOS aunque coincidan con un prefijo sincronizado (defensa en profundidad). */
export const SYNCED_PREFIX_EXCLUDE = [
    "starseed.entitylib.", // Biblioteca por entidad: la gestiona entity-state.ts, no la cuenta
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
 * SECRETOS Y CLAVES DE DISPOSITIVO — LO QUE NUNCA VIAJA (Adenda 68 · A)
 * ═══════════════════════════════════════════════════════════════════════════
 * Regla del proyecto (CLAUDE.md §6 · Identidad Soberana): las CREDENCIALES se
 * quedan cifradas en el dispositivo. Aquí se hace CUMPLIR, no solo se declara.
 *
 * Dos mecanismos:
 *   1. `NEVER_SYNCED_KEYS` / `NEVER_SYNCED_PREFIXES` — la clave entera nunca
 *      sale del dispositivo (secretos puros y estado local del dispositivo).
 *   2. `sanitizeForCloud()` — para claves que SÍ viajan pero cuyo VALOR mezcla
 *      config útil con secretos (las integraciones: `{enabled, endpoint,
 *      apiKey, extra}`). Se sube la config y se poda el secreto.
 */

/** Claves que JAMÁS se suben (ni por clave exacta ni por prefijo dinámico). */
export const NEVER_SYNCED_KEYS = [
    // ── Secretos puros ──────────────────────────────────────────────────────
    "starseed.ai.providers",            // proveedores IA del usuario (claves cifradas en el dispositivo)
    "starseed.ai.active",               // proveedor activo (apunta a una clave local)
    "starseed.ai.salt",                 // material criptográfico del cifrado local
    "starseed.ai.verifier",             // verificador de la contraseña maestra local
    "starseed.connectors.creds.v1",     // credenciales del Hub de Conectores (cifradas, locales)
    "starseed.aurora.wake.porcupine.key", // clave de Porcupine (wake acústico)
    "starseed.aurora.chats.v1",         // multichat: cada chat puede llevar `apiKey` EN CLARO (mode:"custom")
    // ── Estado propio del DISPOSITIVO (sincronizarlo lo rompería) ───────────
    "starseed.aurora.leader.v1",        // elección de instancia única de Aurora (por pestaña/dispositivo)
    "starseed.aurora.orb.hidden.v1",    // descarte de sesión del orbe (no es preferencia estable)
    "starseed.aurora.greeted.session",  // saludo ya dado en esta sesión
    "starseed.astraura.cooldown.v1",    // cooldown de fuentes de IA (medido en ESTE dispositivo)
    "starseed.astraura.usage.v1",       // contadores de uso locales
    "starseed.astraura.routes.v1",      // log de rutas del router (telemetría local)
    "starseed.astraura.huggingbay.cache.v1", // caché de catálogo
    "starseed.sync.realtime.v1",        // interruptor del motor (deliberadamente por dispositivo)
    "starseed.sync.meta.v1",            // marcas de tiempo LWW locales (ver realtime-sync.ts)
] as const;

/** Prefijos que JAMÁS se suben. */
export const NEVER_SYNCED_PREFIXES = [
    "starseed.ai.key.",         // material de claves API por proveedor
    "starseed.connectors.cred", // cualquier variante de credenciales
] as const;

/**
 * Claves que NUNCA viajan y que solo se pueden describir por PATRÓN (llevan un
 * id variable en medio). Adenda 69 · D.
 *
 * ⚠️ CAUSA RAÍZ MEDIDA EN PRODUCCIÓN — por qué esto importa tanto:
 *
 * `SYNCED_PREFIXES` incluye `"starseed.brain."` con la intención de sincronizar
 * la CONFIGURACIÓN de cada cerebro (`.moa`, `.channels`, `.memoryRoots`,
 * `.library`…). Pero el prefijo, tal cual, se tragaba también DOS cosas que no
 * son configuración:
 *
 *   · `starseed.brain.<id>.memory-mirror.v1` → un ESPEJO local (caché) de la
 *     tabla `brain_memory_files`, que YA es la fuente de verdad. Medido en la
 *     cuenta del usuario: 1,75 MB en un solo cerebro, 715 KB en otro.
 *   · `starseed.brain.<id>.offline-queue.v1` → una COLA de trabajo pendiente de
 *     ESTE dispositivo. Sincronizarla entre dispositivos no tiene sentido (y es
 *     activamente dañino: dos neuronas ejecutarían la misma cola).
 *
 * Resultado: la columna `user_settings.prefs` de la cuenta llegó a **2,8 MB**,
 * de los cuales ~2,5 MB eran espejos de memoria duplicados. Y como TODOS los
 * módulos reescribían la columna ENTERA en cada escritura (ver Adenda 69 · A),
 * cada latido de cerebro reenviaba 2,8 MB. Con varias pestañas/dispositivos
 * abiertos, la fila se convirtió en un punto de contención permanente: se
 * observaron `INSERT INTO user_settings` concurrentes bloqueándose entre sí y
 * peticiones muriendo con `57014: canceling statement due to statement timeout`
 * tras 40 s. Por eso la configuración de Aurora NO llegaba a la cuenta: su
 * escritura simplemente EXPIRABA, en silencio (todo el motor es best-effort y
 * se traga los errores). El bug se veía como "solo se guarda en el dispositivo
 * donde se configura".
 *
 * Estas dos claves vuelven a ser lo que siempre debieron ser: LOCALES.
 */
export const NEVER_SYNCED_PATTERNS: readonly RegExp[] = [
    /^starseed\.brain\.[^.]+\.memory-mirror\.v1$/, // caché del espejo de memoria (fuente: brain_memory_files)
    /^starseed\.brain\.[^.]+\.offline-queue\.v1$/, // cola de trabajo de ESTE dispositivo
];

/** ¿Esta clave está PROHIBIDA en la nube? (secreto, caché pesada o estado del dispositivo). */
export function isNeverSyncedKey(key: string): boolean {
    if ((NEVER_SYNCED_KEYS as readonly string[]).includes(key)) return true;
    if (NEVER_SYNCED_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
    return NEVER_SYNCED_PATTERNS.some((re) => re.test(key));
}

/** ¿Es la config de una integración? (global o por cerebro). */
export function isIntegrationConfigKey(key: string): boolean {
    return (
        key.startsWith("starseed.integration.") ||
        /^starseed\.brain\.[^.]+\.integration\./.test(key)
    );
}

/** Nombres de campo que se consideran secretos dentro de `extra` de una integración. */
const SECRET_FIELD_RE = /(key|token|secret|password|passwd|pass|auth|credential|bearer)/i;

/**
 * Poda los SECRETOS del valor antes de subirlo a la cuenta.
 * Hoy solo las integraciones mezclan config y secreto; el resto pasa tal cual.
 * Nunca lanza: ante cualquier duda devuelve el valor original SOLO si no es una
 * clave de integración (si lo es y no se puede podar, se descarta el valor).
 */
export function sanitizeForCloud(key: string, value: unknown): unknown {
    if (!isIntegrationConfigKey(key)) return value;
    try {
        if (!value || typeof value !== "object" || Array.isArray(value)) return value;
        const v = value as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) {
            if (k === "apiKey") continue; // el secreto se queda en el dispositivo
            if (k === "extra" && val && typeof val === "object" && !Array.isArray(val)) {
                const extra: Record<string, unknown> = {};
                for (const [ek, ev] of Object.entries(val as Record<string, unknown>)) {
                    if (SECRET_FIELD_RE.test(ek)) continue; // p. ej. extra.token, extra.apiSecret
                    extra[ek] = ev;
                }
                out.extra = extra;
                continue;
            }
            out[k] = val;
        }
        return out;
    } catch {
        return {}; // ante un valor raro, mejor subir nada que subir un secreto
    }
}

/**
 * Devuelve el valor remoto CON los secretos locales reinyectados, para que
 * aplicar la config de otro dispositivo no BORRE la clave que este dispositivo
 * sí tiene guardada (la clave nunca viaja, pero tampoco debe perderse).
 */
export function mergeLocalSecrets(key: string, remoteValue: unknown, localRaw: string | null): unknown {
    if (!isIntegrationConfigKey(key)) return remoteValue;
    try {
        if (!remoteValue || typeof remoteValue !== "object" || Array.isArray(remoteValue)) return remoteValue;
        if (!localRaw) return remoteValue;
        const local = JSON.parse(localRaw) as Record<string, unknown> | null;
        if (!local || typeof local !== "object" || Array.isArray(local)) return remoteValue;

        const merged: Record<string, unknown> = { ...(remoteValue as Record<string, unknown>) };
        if (typeof local.apiKey === "string" && local.apiKey) merged.apiKey = local.apiKey;

        const localExtra = local.extra;
        if (localExtra && typeof localExtra === "object" && !Array.isArray(localExtra)) {
            const remoteExtra =
                merged.extra && typeof merged.extra === "object" && !Array.isArray(merged.extra)
                    ? { ...(merged.extra as Record<string, unknown>) }
                    : {};
            for (const [ek, ev] of Object.entries(localExtra as Record<string, unknown>)) {
                if (SECRET_FIELD_RE.test(ek)) remoteExtra[ek] = ev; // el secreto local manda
            }
            merged.extra = remoteExtra;
        }
        return merged;
    } catch {
        return remoteValue;
    }
}

/** Claves de Aurora/Astraura (ámbito CUENTA) — usado por la UI de sincronización. */
export function isAuroraKey(key: string): boolean {
    return (
        key.startsWith("starseed.aurora.") ||
        key.startsWith("starseed.astraura.") ||
        key === "starseed.capabilities.v1" ||
        isIntegrationConfigKey(key)
    );
}

/** Claves de Aurora/Astraura que SÍ se sincronizan (para contar en la UI). */
export function auroraSyncedKeys(): string[] {
    return (SYNCED_KEYS as readonly string[]).filter((k) => isAuroraKey(k) && !isNeverSyncedKey(k));
}

export interface SyncResult {
    ok: boolean;
    reason?: "no-session" | "no-table" | "empty" | "error";
    message: string;
    updatedAt?: string;
}

/**
 * Id del usuario. Adenda 69 · C — CAMINO RÁPIDO Y FIABLE.
 *
 * Antes llamaba SOLO a `auth.getUser()`, que es una petición de RED a
 * /auth/v1/user. Esta función alimenta a `hasStarseedSession()`, que es
 * justamente lo que decide si arranca el motor de sincronización
 * (RealtimeSyncProvider). Con la red lenta o en el primer instante de la carga,
 * la llamada tardaba o fallaba y el OS concluía "no hay sesión" AUNQUE la
 * sesión estuviera intacta en la cookie: sync muerto y sensación de "se ha
 * cerrado la sesión / tarda en restaurarse" al recargar.
 *
 * `getSession()` lee la sesión de la cookie: instantánea y sin red. Primero esa;
 * `getUser()` queda de respaldo.
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

function collectPrefs(): Record<string, unknown> {
    const bundle: Record<string, unknown> = {};
    if (typeof window === "undefined") return bundle;
    for (const key of SYNCED_KEYS) {
        if (isNeverSyncedKey(key)) continue; // defensa en profundidad (nunca debería estar en la lista)
        const raw = window.localStorage.getItem(key);
        if (raw != null) {
            let value: unknown;
            try { value = JSON.parse(raw); }
            catch { value = raw; } // valores no-JSON (p.ej. "on"/"off") tal cual
            bundle[key] = sanitizeForCloud(key, value); // los secretos NO salen del dispositivo
        }
    }
    return bundle;
}

/** ¿Hay una sesión StarSeed activa en este dispositivo? */
export async function hasStarseedSession(): Promise<boolean> {
    return (await getUserId()) != null;
}

/** Sube las preferencias locales a la cuenta (mezcla NO destructiva de la fila propia). */
export async function pushPreferences(): Promise<SyncResult> {
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: "no-session", message: "Inicia sesión con tu cuenta StarSeed para sincronizar." };

    const prefs = collectPrefs();
    if (Object.keys(prefs).length === 0) return { ok: false, reason: "empty", message: "No hay preferencias locales que subir todavía." };

    try {
        // ── Adenda 69 · A — EL PEOR DE TODOS ────────────────────────────────
        // Antes esto hacía `upsert({ prefs })` con SOLO las SYNCED_KEYS, sin
        // leer siquiera lo que ya había. Es decir: el botón "Sincronizar ahora"
        // de Ajustes → Cuenta ANIQUILABA de un golpe todas las claves heredadas
        // de la fila (`agents`, `dashboards`, `library`, `installed`,
        // `capabilities`, `cydia*`, `devices`, `connectors`, `ossServices`… y el
        // propio `__meta` con las marcas LWW). Sincronizar borraba la cuenta.
        // Ahora se manda como PARCHE y Postgres lo funde de forma atómica.
        const res = await mergeUserPrefs(prefs, { userId });
        if (!res.ok) {
            return {
                ok: false,
                reason: res.missingTable ? "no-table" : "error",
                message: res.missingTable
                    ? "Falta crear la tabla user_settings en Supabase (ver SOP). Tus ajustes siguen guardados localmente."
                    : `No se pudo subir: ${res.error ?? "error desconocido"}`,
            };
        }
        return { ok: true, message: "Preferencias guardadas en tu cuenta StarSeed.", updatedAt: new Date().toISOString() };
    } catch (e: any) {
        return { ok: false, reason: "error", message: `Error de red al subir: ${e?.message ?? e}` };
    }
}

/**
 * Descarga las preferencias de la cuenta y las aplica a localStorage.
 * No fuerza recarga: el llamador decide (recomendado recargar para que todos
 * los contextos relean su estado de forma limpia).
 */
export async function pullPreferences(): Promise<SyncResult & { applied?: string[] }> {
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: "no-session", message: "Inicia sesión con tu cuenta StarSeed para recuperar tus ajustes." };

    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("user_settings")
            .select("prefs, updated_at")
            .eq("user_id", userId)
            .maybeSingle();

        if (error) {
            const missing = /relation .*user_settings.* does not exist/i.test(error.message);
            return {
                ok: false,
                reason: missing ? "no-table" : "error",
                message: missing
                    ? "Falta crear la tabla user_settings en Supabase (ver SOP)."
                    : `No se pudo descargar: ${error.message}`,
            };
        }
        if (!data?.prefs || typeof data.prefs !== "object") {
            return { ok: false, reason: "empty", message: "Tu cuenta aún no tiene preferencias guardadas." };
        }

        const applied: string[] = [];
        for (const [key, value] of Object.entries(data.prefs as Record<string, unknown>)) {
            if (isNeverSyncedKey(key)) continue; // nunca aplicar secretos/estado de otro dispositivo
            const isExactKey = (SYNCED_KEYS as readonly string[]).includes(key);
            const isExcludedPrefix = SYNCED_PREFIX_EXCLUDE.some((prefix) => key.startsWith(prefix));
            const isDynamicPrefix = !isExcludedPrefix && SYNCED_PREFIXES.some((prefix) => key.startsWith(prefix));
            if (!isExactKey && !isDynamicPrefix) continue; // ni clave exacta ni prefijo dinámico permitido
            try {
                // La clave API local se conserva: la nube nunca la trae, y aplicar
                // la config remota no debe borrar la que este dispositivo ya tiene.
                const merged = mergeLocalSecrets(key, value, window.localStorage.getItem(key));
                const serialized = typeof merged === "string" ? merged : JSON.stringify(merged);
                window.localStorage.setItem(key, serialized);
                applied.push(key);
            } catch { /* clave individual ignorada */ }
        }
        return { ok: true, message: `Ajustes recuperados de tu cuenta (${applied.length}).`, applied, updatedAt: data.updated_at };
    } catch (e: any) {
        return { ok: false, reason: "error", message: `Error de red al descargar: ${e?.message ?? e}` };
    }
}
