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
    // ── Conectores de integraciones (Adenda 67 · P4). Solo endpoints/preferencias:
    //    las CLAVES de cada servicio quedan cifradas en el dispositivo, nunca viajan.
    "starseed.integration.typesense",        // búsqueda (con caída a Supabase)
    "starseed.integration.postiz",           // publicación en redes (siempre con confirmación explícita)
    "starseed.integration.tencentdb-memory", // memoria de agente por gateway HTTP
    "starseed.integration.databasement",     // servidor de copias de seguridad de cuenta/cerebro/perfil
    "starseed.integration.openmanus",        // delegación de tareas a agentes
    "starseed.integration.penpot",           // diseño/lienzo por instancia
    "starseed.integration.opencut",          // edición de vídeo
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

export interface SyncResult {
    ok: boolean;
    reason?: "no-session" | "no-table" | "empty" | "error";
    message: string;
    updatedAt?: string;
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

function collectPrefs(): Record<string, unknown> {
    const bundle: Record<string, unknown> = {};
    if (typeof window === "undefined") return bundle;
    for (const key of SYNCED_KEYS) {
        const raw = window.localStorage.getItem(key);
        if (raw != null) {
            try { bundle[key] = JSON.parse(raw); }
            catch { bundle[key] = raw; } // valores no-JSON (p.ej. "on"/"off") tal cual
        }
    }
    return bundle;
}

/** ¿Hay una sesión StarSeed activa en este dispositivo? */
export async function hasStarseedSession(): Promise<boolean> {
    return (await getUserId()) != null;
}

/** Sube las preferencias locales a la cuenta (upsert de la fila propia). */
export async function pushPreferences(): Promise<SyncResult> {
    const userId = await getUserId();
    if (!userId) return { ok: false, reason: "no-session", message: "Inicia sesión con tu cuenta StarSeed para sincronizar." };

    const prefs = collectPrefs();
    if (Object.keys(prefs).length === 0) return { ok: false, reason: "empty", message: "No hay preferencias locales que subir todavía." };

    try {
        const supabase = createClient();
        const { error } = await supabase
            .from("user_settings")
            .upsert({ user_id: userId, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (error) {
            const missing = /relation .*user_settings.* does not exist/i.test(error.message);
            return {
                ok: false,
                reason: missing ? "no-table" : "error",
                message: missing
                    ? "Falta crear la tabla user_settings en Supabase (ver SOP). Tus ajustes siguen guardados localmente."
                    : `No se pudo subir: ${error.message}`,
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
            const isExactKey = (SYNCED_KEYS as readonly string[]).includes(key);
            const isExcludedPrefix = SYNCED_PREFIX_EXCLUDE.some((prefix) => key.startsWith(prefix));
            const isDynamicPrefix = !isExcludedPrefix && SYNCED_PREFIXES.some((prefix) => key.startsWith(prefix));
            if (!isExactKey && !isDynamicPrefix) continue; // ni clave exacta ni prefijo dinámico permitido
            try {
                const serialized = typeof value === "string" ? value : JSON.stringify(value);
                window.localStorage.setItem(key, serialized);
                applied.push(key);
            } catch { /* clave individual ignorada */ }
        }
        return { ok: true, message: `Ajustes recuperados de tu cuenta (${applied.length}).`, applied, updatedAt: data.updated_at };
    } catch (e: any) {
        return { ok: false, reason: "error", message: `Error de red al descargar: ${e?.message ?? e}` };
    }
}
