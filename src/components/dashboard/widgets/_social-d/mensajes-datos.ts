"use client";
/**
 * Datos del widget de Mensajes (Ola 0929 · D) — la bandeja REAL de la mensajería del OS
 * (`os_dm_threads` / `os_dm_members` / `os_dm_messages`, la misma de /messages), en una lectura
 * LIGERA pensada para un widget: 6 peticiones como mucho por vuelta, cada ≥ 5 min y solo con la
 * pestaña a la vista (fuente-compartida). `listThreads()` de la página cuesta 3 + 2·N peticiones
 * (una para el último mensaje y otra para los no leídos de CADA hilo): en un tablero eso era
 * inasumible con el contrato «consumo».
 *
 * No leídos: los mensajes de otras personas posteriores a mi marca de lectura — la local de este
 * dispositivo (`starseed.dm.readmarks.v1`, la misma que escribe /messages) o la de la cuenta
 * (`meta.readMarks[uid]` del hilo), la más reciente de las dos.
 */
import { createClient } from "@/utils/supabase/client";
import { uidActual } from "@/lib/consumo/usuario";
import { falloDe, type FalloConsulta } from "@/lib/network/bucle-fondo";
import { msDe } from "./formato";

/** Los hilos que el widget enseña (y de los que lee el último tramo de mensajes). */
export const HILOS_WIDGET = 8;
/** Tramo de mensajes recientes que se lee de esos hilos, de una vez. */
export const TRAMO_MENSAJES = 64;
/** Clave de las marcas de lectura locales de /messages (src/lib/messages/dm.ts). */
export const CLAVE_MARCAS_LECTURA = "starseed.dm.readmarks.v1";

/** `os_presencia` puede no existir aún en la base viva: un 42P01 la apaga para la sesión. */
let presenciaDisponible = true;

export interface PerfilMini {
    nombre: string;
    handle: string | null;
    avatar: string | null;
}

export interface UltimoMensaje {
    texto: string;
    remitente: string | null;
    tipo: "user" | "agent" | "system";
    adjunto: string | null;
    ms: number;
}

export interface HiloResumen {
    id: string;
    tipo: "dm" | "group";
    titulo: string | null;
    avatar: string | null;
    miembros: string[];
    /** El otro miembro de un DM. */
    companero: string | null;
    ultimo: UltimoMensaje | null;
    /** Los últimos mensajes del hilo que entraron en el tramo (más nuevo primero, máx. 4). */
    recientes: UltimoMensaje[];
    noLeidos: number;
    /** El tramo leído no alcanza para contar todos los no leídos de este hilo. */
    noLeidosMas: boolean;
    ms: number;
}

export interface BandejaMensajes {
    uid: string;
    hilos: HiloResumen[];
    perfiles: Record<string, PerfilMini>;
    /** userId → ms de su último latido visible (solo si la presencia está disponible). */
    vistos: Record<string, number>;
}

interface FilaHilo {
    id: string;
    kind: string | null;
    title: string | null;
    avatar_url: string | null;
    meta: unknown;
    last_msg_at: string | null;
    created_at: string | null;
}

interface FilaMensaje {
    id: string;
    thread_id: string;
    sender: string | null;
    body: string | null;
    attachments: unknown;
    kind: string | null;
    deleted: boolean | null;
    created_at: string;
}

/** Marcas de lectura locales (hilo → ISO). */
export function marcasLocales(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
        const raw = window.localStorage.getItem(CLAVE_MARCAS_LECTURA);
        const j = raw ? JSON.parse(raw) : {};
        return j && typeof j === "object" ? (j as Record<string, string>) : {};
    } catch {
        return {};
    }
}

/** Marca de lectura efectiva de un hilo: la más reciente entre la local y la de la cuenta. */
export function marcaLectura(hilo: { id: string; meta?: unknown }, uid: string, locales: Record<string, string>): number {
    const local = msDe(locales[hilo.id]);
    const meta = hilo.meta && typeof hilo.meta === "object" ? (hilo.meta as Record<string, unknown>) : {};
    const remotas = meta.readMarks && typeof meta.readMarks === "object" ? (meta.readMarks as Record<string, string>) : {};
    return Math.max(local, msDe(remotas[uid]));
}

const ETIQUETA_ADJUNTO: Record<string, string> = { image: "Foto", audio: "Audio", video: "Vídeo", file: "Archivo", ref: "Enlace" };

/** Texto de vista previa de un mensaje (adjunto sin texto → su tipo). */
export function vistaPrevia(m: Pick<FilaMensaje, "body" | "attachments" | "deleted">): { texto: string; adjunto: string | null } {
    if (m.deleted) return { texto: "Mensaje eliminado", adjunto: null };
    const adj = Array.isArray(m.attachments) ? (m.attachments as Array<{ kind?: string; name?: string }>) : [];
    const primero = adj[0];
    const adjunto = primero ? ETIQUETA_ADJUNTO[primero.kind ?? ""] ?? "Adjunto" : null;
    const texto = (m.body ?? "").replace(/\s+/g, " ").trim();
    if (texto) return { texto, adjunto };
    return { texto: adjunto ? (primero?.name ? `${adjunto}: ${primero.name}` : adjunto) : "", adjunto };
}

/**
 * Resume hilos + tramo de mensajes (PURO: sin red). `mensajes` viene ordenado del más nuevo al
 * más viejo; `marcas` es hilo → ms de lectura.
 */
export function resumirHilos(
    hilos: FilaHilo[],
    miembrosPorHilo: Record<string, string[]>,
    mensajes: FilaMensaje[],
    uid: string,
    marcas: Record<string, number>,
    tramoCompleto: boolean,
): HiloResumen[] {
    const porHilo = new Map<string, FilaMensaje[]>();
    for (const m of mensajes) {
        const l = porHilo.get(m.thread_id) ?? [];
        l.push(m);
        porHilo.set(m.thread_id, l);
    }
    return hilos.map((h) => {
        const lista = porHilo.get(h.id) ?? [];
        const ultimoFila = lista[0] ?? null;
        const marca = marcas[h.id] ?? 0;
        const ajenos = lista.filter((m) => m.sender !== uid && !m.deleted && m.kind !== "system" && msDe(m.created_at) > marca);
        const miembros = miembrosPorHilo[h.id] ?? [];
        const tipo: "dm" | "group" = h.kind === "group" ? "group" : "dm";
        const aMensaje = (m: FilaMensaje): UltimoMensaje => {
            const v = vistaPrevia(m);
            return { texto: v.texto, adjunto: v.adjunto, remitente: m.sender, tipo: (m.kind as UltimoMensaje["tipo"]) || "user", ms: msDe(m.created_at) };
        };
        const recientes = lista.slice(0, 4).map(aMensaje);
        return {
            id: h.id,
            tipo,
            titulo: h.title,
            avatar: h.avatar_url,
            miembros,
            companero: tipo === "dm" ? miembros.find((m) => m !== uid) ?? null : null,
            ultimo: recientes[0] ?? null,
            recientes,
            noLeidos: ajenos.length,
            // Si el tramo se llenó y TODO lo de este hilo en el tramo está sin leer, puede haber más.
            noLeidosMas: tramoCompleto && lista.length > 0 && ajenos.length === lista.length,
            ms: Math.max(msDe(h.last_msg_at), msDe(h.created_at), ultimoFila ? msDe(ultimoFila.created_at) : 0),
        };
    }).sort((a, b) => b.ms - a.ms);
}

function error(res: { error?: unknown; status?: number }): FalloConsulta | null {
    return falloDe(res);
}

/** Una vuelta de lectura de la bandeja. Nunca lanza. `null` en `datos` = sin sesión. */
export async function cargarBandeja(): Promise<{ datos?: BandejaMensajes | null; fallo?: FalloConsulta | null }> {
    const uid = await uidActual();
    if (!uid) return { datos: null };
    const sb = createClient();

    const mios = await sb.from("os_dm_members").select("thread_id").eq("user_id", uid);
    const f1 = error(mios as { error?: unknown; status?: number });
    if (f1) return { fallo: f1 };
    const ids = ((mios.data as { thread_id: string }[] | null) ?? []).map((r) => r.thread_id);
    if (ids.length === 0) return { datos: { uid, hilos: [], perfiles: {}, vistos: {} } };

    const rh = await sb
        .from("os_dm_threads")
        .select("id, kind, title, avatar_url, meta, last_msg_at, created_at")
        .in("id", ids)
        .order("last_msg_at", { ascending: false, nullsFirst: false })
        .limit(HILOS_WIDGET + 4);
    const f2 = error(rh as { error?: unknown; status?: number });
    if (f2) return { fallo: f2 };
    // Los hilos de Correos comparten tabla (meta.mail = true): no son chats.
    const hilos = ((rh.data as FilaHilo[] | null) ?? [])
        .filter((h) => !(h.meta && typeof h.meta === "object" && (h.meta as { mail?: boolean }).mail === true))
        .slice(0, HILOS_WIDGET);
    if (hilos.length === 0) return { datos: { uid, hilos: [], perfiles: {}, vistos: {} } };
    const idsHilos = hilos.map((h) => h.id);

    const [rm, rmsg] = await Promise.all([
        sb.from("os_dm_members").select("thread_id, user_id").in("thread_id", idsHilos),
        sb.from("os_dm_messages")
            .select("id, thread_id, sender, body, attachments, kind, deleted, created_at")
            .in("thread_id", idsHilos)
            .order("created_at", { ascending: false })
            .limit(TRAMO_MENSAJES),
    ]);
    const f3 = error(rm as { error?: unknown; status?: number }) ?? error(rmsg as { error?: unknown; status?: number });
    if (f3) return { fallo: f3 };

    const miembrosPorHilo: Record<string, string[]> = {};
    for (const r of (rm.data as { thread_id: string; user_id: string }[] | null) ?? []) {
        (miembrosPorHilo[r.thread_id] ??= []).push(r.user_id);
    }
    const mensajes = (rmsg.data as FilaMensaje[] | null) ?? [];
    const locales = marcasLocales();
    const marcas: Record<string, number> = {};
    for (const h of hilos) marcas[h.id] = marcaLectura(h, uid, locales);
    const resumen = resumirHilos(hilos, miembrosPorHilo, mensajes, uid, marcas, mensajes.length >= TRAMO_MENSAJES);

    // Perfiles de quien hace falta nombrar: el otro de cada DM y el autor del último mensaje de grupo.
    const quienes = new Set<string>();
    for (const h of resumen) {
        if (h.companero) quienes.add(h.companero);
        if (h.tipo === "group" && h.ultimo?.remitente && h.ultimo.remitente !== uid) quienes.add(h.ultimo.remitente);
    }
    const perfiles: Record<string, PerfilMini> = {};
    const vistos: Record<string, number> = {};
    if (quienes.size) {
        const lista = [...quienes];
        const [rp, rpres] = await Promise.all([
            sb.from("os_profiles").select("user_id, username, display_name, avatar_url").in("user_id", lista),
            presenciaDisponible
                ? sb.from("os_presencia").select("user_id, visto, visible").in("user_id", lista.filter((id) => resumen.some((h) => h.companero === id)))
                : Promise.resolve({ data: [], error: null }),
        ]);
        for (const r of (rp.data as { user_id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] | null) ?? []) {
            perfiles[r.user_id] = { nombre: r.display_name || r.username || "Persona", handle: r.username, avatar: r.avatar_url };
        }
        const ep = (rpres as { error?: { code?: string; message?: string } | null }).error;
        if (ep && (ep.code === "42P01" || ep.code === "PGRST205" || /os_presencia/i.test(ep.message ?? ""))) presenciaDisponible = false;
        for (const r of ((rpres as { data?: unknown }).data as { user_id: string; visto: string; visible: boolean }[] | null) ?? []) {
            if (r.visible) vistos[r.user_id] = msDe(r.visto);
        }
    }
    return { datos: { uid, hilos: resumen, perfiles, vistos } };
}

/** Presencia con el mismo umbral que /messages (150 s desde el último latido). */
export function presenciaDe(visto: number | undefined, ahora: number): "en-linea" | "reciente" | null {
    if (!visto) return null;
    if (ahora - visto < 150_000) return "en-linea";
    if (ahora - visto < 30 * 60_000) return "reciente";
    return null;
}
