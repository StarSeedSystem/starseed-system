"use client";

/**
 * carpetas-hilo — carpetas de un chat (contrato C7 / `carpetas-tipos.ts`).
 *
 * - "privada": solo la ve quien la crea. Vive en `entity_state` de su cuenta
 *   (clave `CLAVE_CARPETAS_PRIVADAS`, doc `{ hilos: Record<hiloId, CarpetaHilo[]> }`),
 *   local-first + debounced, al estilo de `@/lib/contactos/store.ts`.
 * - "chat"/"publica": las ven y editan todos los miembros. Viven en
 *   `os_dm_threads.meta.carpetas` — lectura-fusión-escritura por elemento,
 *   preservando el resto de `meta`.
 * - `publicarEnBiblioteca`: crea una carpeta pública en la Biblioteca del usuario
 *   y guarda cada ítem vivo como referencia (título + url/ruta).
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";
import { currentUserRef, getEntityStateChecked, setEntityStateChecked, type EntityRef } from "@/lib/sync/entity-state";
import { emitChange, onChange } from "@/lib/sync/live-signal";
import { onTableChange } from "@/lib/realtime/realtime";
import { createFolder, libraryRef, saveItem, setFolderAcl } from "@/lib/library/entity-library";
import {
    CLAVE_CARPETAS_PRIVADAS,
    type CarpetaHilo,
    type ItemCarpeta,
    type VisibilidadCarpeta,
} from "@/lib/mensajeria/carpetas-tipos";

const DEBOUNCE_MS = 800;

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
function ahoraIso(): string {
    return new Date().toISOString();
}
function nuevoId(): string {
    try {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    } catch {
        /* entorno sin crypto.randomUUID */
    }
    return `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function vivas(xs: CarpetaHilo[]): CarpetaHilo[] {
    return xs.filter((c) => !c.borrado);
}

// ─────────────────────────── Fusión (helpers puros, exportados para tests) ───────────────────────────

function ganadorCarpeta(x: CarpetaHilo, y: CarpetaHilo): CarpetaHilo {
    const tx = Date.parse(x.actualizado) || 0;
    const ty = Date.parse(y.actualizado) || 0;
    if (tx !== ty) return tx > ty ? x : y;
    return JSON.stringify(x) <= JSON.stringify(y) ? x : y;
}

/** Fusiona dos colecciones de carpetas por `id` (LWW por `actualizado`; `borrado` es una lápida más del elemento). */
export function fusionarCarpetas(a: CarpetaHilo[], b: CarpetaHilo[]): CarpetaHilo[] {
    const mapa = new Map<string, CarpetaHilo>();
    for (const c of a) mapa.set(c.id, c);
    for (const c of b) {
        const existente = mapa.get(c.id);
        mapa.set(c.id, existente ? ganadorCarpeta(existente, c) : c);
    }
    return Array.from(mapa.values()).sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export interface DocCarpetasPrivadas {
    hilos: Record<string, CarpetaHilo[]>;
}

/** Fusiona dos documentos de carpetas privadas: por hilo, y dentro de cada hilo por carpeta (`fusionarCarpetas`). */
export function fusionarDocCarpetasPrivadas(a: DocCarpetasPrivadas, b: DocCarpetasPrivadas): DocCarpetasPrivadas {
    const ids = new Set([...Object.keys(a.hilos ?? {}), ...Object.keys(b.hilos ?? {})]);
    const hilos: Record<string, CarpetaHilo[]> = {};
    for (const id of ids) hilos[id] = fusionarCarpetas(a.hilos?.[id] ?? [], b.hilos?.[id] ?? []);
    return { hilos };
}

function normalizarItem(raw: unknown): ItemCarpeta | null {
    if (!raw || typeof raw !== "object") return null;
    const it = raw as Partial<ItemCarpeta>;
    if (typeof it.id !== "string" || typeof it.mensajeId !== "string" || typeof it.titulo !== "string") return null;
    return {
        id: it.id,
        mensajeId: it.mensajeId,
        adjuntoIndice: typeof it.adjuntoIndice === "number" ? it.adjuntoIndice : null,
        titulo: it.titulo,
        categoria: (it.categoria as ItemCarpeta["categoria"]) ?? "otro",
        url: typeof it.url === "string" ? it.url : undefined,
        agregado: typeof it.agregado === "string" ? it.agregado : ahoraIso(),
        por: typeof it.por === "string" ? it.por : "",
        borrado: it.borrado === null || typeof it.borrado === "string" ? it.borrado : null,
    };
}

function normalizarCarpeta(raw: unknown): CarpetaHilo | null {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Partial<CarpetaHilo>;
    if (typeof c.id !== "string" || typeof c.hiloId !== "string" || typeof c.nombre !== "string") return null;
    if (c.visibilidad !== "privada" && c.visibilidad !== "chat" && c.visibilidad !== "publica") return null;
    return {
        id: c.id,
        hiloId: c.hiloId,
        nombre: c.nombre,
        color: typeof c.color === "string" ? c.color : "#7C5CFF",
        visibilidad: c.visibilidad,
        creador: typeof c.creador === "string" ? c.creador : "",
        items: Array.isArray(c.items) ? c.items.map(normalizarItem).filter((x): x is ItemCarpeta => !!x) : [],
        carpetaBibliotecaId: typeof c.carpetaBibliotecaId === "string" ? c.carpetaBibliotecaId : c.carpetaBibliotecaId === null ? null : undefined,
        creado: typeof c.creado === "string" ? c.creado : ahoraIso(),
        actualizado: typeof c.actualizado === "string" ? c.actualizado : ahoraIso(),
        borrado: c.borrado === null || typeof c.borrado === "string" ? c.borrado : null,
    };
}

function normalizarCarpetas(raw: unknown): CarpetaHilo[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizarCarpeta).filter((x): x is CarpetaHilo => !!x);
}

function normalizarDocPrivadas(raw: unknown): DocCarpetasPrivadas {
    if (!raw || typeof raw !== "object") return { hilos: {} };
    const v = raw as { hilos?: unknown };
    if (!v.hilos || typeof v.hilos !== "object") return { hilos: {} };
    const hilos: Record<string, CarpetaHilo[]> = {};
    for (const [id, arr] of Object.entries(v.hilos as Record<string, unknown>)) hilos[id] = normalizarCarpetas(arr);
    return { hilos };
}

// ─────────────────────────── Carpetas PRIVADAS (entity_state de la cuenta) ───────────────────────────

function claveCachePrivadas(uid: string): string {
    return `starseed.mensajeria.carpetas-privadas.v1.${uid}`;
}
function temaPrivadas(uid: string): string {
    return `mensajeria:carpetas-privadas:${uid}`;
}

function leerCachePrivadas(uid: string): DocCarpetasPrivadas {
    if (!isClient()) return { hilos: {} };
    try {
        const raw = localStorage.getItem(claveCachePrivadas(uid));
        return raw ? normalizarDocPrivadas(JSON.parse(raw)) : { hilos: {} };
    } catch {
        return { hilos: {} };
    }
}
function escribirCachePrivadas(uid: string, doc: DocCarpetasPrivadas): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(claveCachePrivadas(uid), JSON.stringify(doc));
    } catch {
        /* noop */
    }
}

interface EstadoPrivadas {
    listo: boolean;
    uid: string | null;
    doc: DocCarpetasPrivadas;
    error: string | null;
}
const ESTADO_PRIVADAS_INICIAL: EstadoPrivadas = { listo: false, uid: null, doc: { hilos: {} }, error: null };
let estadoPrivadas: EstadoPrivadas = ESTADO_PRIVADAS_INICIAL;
const listenersPrivadas = new Set<() => void>();

function notificarPrivadas(): void {
    for (const cb of listenersPrivadas) {
        try {
            cb();
        } catch {
            /* noop */
        }
    }
}
function actualizarPrivadas(patch: Partial<EstadoPrivadas>): void {
    estadoPrivadas = { ...estadoPrivadas, ...patch };
    notificarPrivadas();
}
function snapshotPrivadas(): EstadoPrivadas {
    return estadoPrivadas;
}
function snapshotPrivadasServidor(): EstadoPrivadas {
    return ESTADO_PRIVADAS_INICIAL;
}

let temporizadorPrivadas: ReturnType<typeof setTimeout> | null = null;
let unsubscribeLivePrivadas: (() => void) | null = null;
let inicializandoPrivadas = false;
let inicializadoPrivadas = false;

function suscribirLivePrivadas(uid: string): void {
    if (unsubscribeLivePrivadas) return;
    unsubscribeLivePrivadas = onChange(temaPrivadas(uid), () => {
        void refrescarPrivadasDesdeNube(uid);
    });
}

async function refrescarPrivadasDesdeNube(uid: string): Promise<void> {
    const ref: EntityRef = { kind: "user", id: uid };
    try {
        const { row, error } = await getEntityStateChecked<DocCarpetasPrivadas>(ref, CLAVE_CARPETAS_PRIVADAS);
        if (error || !row) return;
        const remoto = normalizarDocPrivadas(row.value);
        const local = leerCachePrivadas(uid);
        const fundido = fusionarDocCarpetasPrivadas(local, remoto);
        escribirCachePrivadas(uid, fundido);
        if (estadoPrivadas.uid === uid) actualizarPrivadas({ doc: fundido, error: null });
    } catch {
        /* best-effort */
    }
}

function programarGuardadoPrivadas(uid: string): void {
    if (temporizadorPrivadas) clearTimeout(temporizadorPrivadas);
    temporizadorPrivadas = setTimeout(() => {
        temporizadorPrivadas = null;
        void guardarPrivadasEnNube(uid);
    }, DEBOUNCE_MS);
}

async function guardarPrivadasEnNube(uid: string): Promise<void> {
    const ref: EntityRef = { kind: "user", id: uid };
    const local = leerCachePrivadas(uid);
    try {
        const { row: remotoRow } = await getEntityStateChecked<DocCarpetasPrivadas>(ref, CLAVE_CARPETAS_PRIVADAS);
        const remoto = remotoRow ? normalizarDocPrivadas(remotoRow.value) : null;
        const aFundir = remoto ? fusionarDocCarpetasPrivadas(local, remoto) : local;
        const { row, error } = await setEntityStateChecked<DocCarpetasPrivadas>(ref, CLAVE_CARPETAS_PRIVADAS, aFundir);
        if (row) {
            escribirCachePrivadas(uid, aFundir);
            if (estadoPrivadas.uid === uid) actualizarPrivadas({ doc: aFundir, error: null });
            void emitChange(temaPrivadas(uid));
        } else if (estadoPrivadas.uid === uid) {
            actualizarPrivadas({ error: error ?? "No se pudo guardar la carpeta privada." });
        }
    } catch (e) {
        if (estadoPrivadas.uid === uid) {
            actualizarPrivadas({ error: (e as Error)?.message || "Error de red al guardar la carpeta privada." });
        }
    }
}

async function inicializarPrivadas(): Promise<void> {
    if (typeof window === "undefined" || inicializadoPrivadas || inicializandoPrivadas) return;
    inicializandoPrivadas = true;
    try {
        const ref = await currentUserRef();
        if (!ref) {
            actualizarPrivadas({ listo: true, uid: null, doc: { hilos: {} }, error: null });
            return;
        }
        const uid = ref.id;
        const local = leerCachePrivadas(uid);
        actualizarPrivadas({ listo: true, uid, doc: local, error: null });
        suscribirLivePrivadas(uid);
        const { row, error } = await getEntityStateChecked<DocCarpetasPrivadas>({ kind: "user", id: uid }, CLAVE_CARPETAS_PRIVADAS);
        if (error) {
            if (estadoPrivadas.uid === uid) actualizarPrivadas({ error });
        } else if (row) {
            const fundido = fusionarDocCarpetasPrivadas(local, normalizarDocPrivadas(row.value));
            escribirCachePrivadas(uid, fundido);
            if (estadoPrivadas.uid === uid) actualizarPrivadas({ doc: fundido, error: null });
        }
    } finally {
        inicializandoPrivadas = false;
        inicializadoPrivadas = true;
    }
}

function suscribirPrivadas(cb: () => void): () => void {
    listenersPrivadas.add(cb);
    if (typeof window !== "undefined" && !inicializadoPrivadas && !inicializandoPrivadas) void inicializarPrivadas();
    return () => {
        listenersPrivadas.delete(cb);
    };
}

function mutarPrivadas(hiloId: string, fn: (actuales: CarpetaHilo[], ahora: string) => CarpetaHilo[]): void {
    const uid = estadoPrivadas.uid;
    if (!uid) return;
    const ahora = ahoraIso();
    const actuales = estadoPrivadas.doc.hilos[hiloId] ?? [];
    const siguientes = fn(actuales, ahora);
    const doc: DocCarpetasPrivadas = { hilos: { ...estadoPrivadas.doc.hilos, [hiloId]: siguientes } };
    escribirCachePrivadas(uid, doc);
    actualizarPrivadas({ doc });
    programarGuardadoPrivadas(uid);
}

/** Reinicia el estado de las carpetas privadas (uso exclusivo de tests). */
export function resetCarpetasPrivadasParaTests(): void {
    estadoPrivadas = { ...ESTADO_PRIVADAS_INICIAL, doc: { hilos: {} } };
    inicializadoPrivadas = false;
    inicializandoPrivadas = false;
    if (temporizadorPrivadas) {
        clearTimeout(temporizadorPrivadas);
        temporizadorPrivadas = null;
    }
    if (unsubscribeLivePrivadas) {
        try {
            unsubscribeLivePrivadas();
        } catch {
            /* noop */
        }
        unsubscribeLivePrivadas = null;
    }
    listenersPrivadas.clear();
}

// ─────────────────────────── Carpetas de CHAT/PÚBLICAS (os_dm_threads.meta) ───────────────────────────

interface EstadoChat {
    listo: boolean;
    carpetas: CarpetaHilo[];
    error: string | null;
}
const ESTADO_CHAT_SERVIDOR: EstadoChat = { listo: false, carpetas: [], error: null };
const estadoChat = new Map<string, EstadoChat>();
const listenersChat = new Map<string, Set<() => void>>();
const cargandoChat = new Set<string>();
const unsubRealtimeChat = new Map<string, () => void>();

/** Estado de un hilo aún sin cargar. SIEMPRE el mismo objeto: `useSyncExternalStore` exige una
 *  instantánea estable; un `{…}` nuevo en cada lectura provocaba el bucle «Maximum update depth
 *  exceeded» (React #185) al abrir cualquier chat. */
const ESTADO_CHAT_VACIO: EstadoChat = Object.freeze({ listo: false, carpetas: [], error: null }) as EstadoChat;
function obtenerEstadoChat(hiloId: string): EstadoChat {
    return estadoChat.get(hiloId) ?? ESTADO_CHAT_VACIO;
}
function actualizarEstadoChat(hiloId: string, patch: Partial<EstadoChat>): void {
    estadoChat.set(hiloId, { ...obtenerEstadoChat(hiloId), ...patch });
    const set = listenersChat.get(hiloId);
    if (set) {
        for (const cb of set) {
            try {
                cb();
            } catch {
                /* noop */
            }
        }
    }
}

async function leerMetaHilo(hiloId: string): Promise<{ meta: Record<string, unknown>; carpetas: CarpetaHilo[]; error: string | null }> {
    try {
        const supabase = createClient();
        const { data, error } = await supabase.from("os_dm_threads").select("meta").eq("id", hiloId).maybeSingle();
        if (error) return { meta: {}, carpetas: [], error: error.message || "No se pudieron leer las carpetas del chat." };
        const meta = (data?.meta && typeof data.meta === "object" ? (data.meta as Record<string, unknown>) : {}) ?? {};
        return { meta, carpetas: normalizarCarpetas(meta.carpetas), error: null };
    } catch (e) {
        return { meta: {}, carpetas: [], error: (e as Error)?.message || "Error de red al leer las carpetas del chat." };
    }
}

async function cargarChat(hiloId: string): Promise<void> {
    if (cargandoChat.has(hiloId)) return;
    cargandoChat.add(hiloId);
    try {
        const { carpetas, error } = await leerMetaHilo(hiloId);
        actualizarEstadoChat(hiloId, { listo: true, carpetas, error });
    } finally {
        cargandoChat.delete(hiloId);
    }
}

function asegurarRealtimeChat(hiloId: string): void {
    if (unsubRealtimeChat.has(hiloId)) return;
    try {
        const unsub = onTableChange("os_dm_threads", { filter: `id=eq.${hiloId}` }, () => {
            void cargarChat(hiloId);
        });
        unsubRealtimeChat.set(hiloId, unsub);
    } catch {
        /* best-effort: queda el refetch al enfocar la pestaña */
    }
}
function liberarRealtimeChat(hiloId: string): void {
    const unsub = unsubRealtimeChat.get(hiloId);
    if (!unsub) return;
    unsubRealtimeChat.delete(hiloId);
    try {
        unsub();
    } catch {
        /* noop */
    }
}

function suscribirChat(hiloId: string, cb: () => void): () => void {
    let set = listenersChat.get(hiloId);
    if (!set) {
        set = new Set();
        listenersChat.set(hiloId, set);
    }
    set.add(cb);
    if (typeof window !== "undefined" && !obtenerEstadoChat(hiloId).listo) void cargarChat(hiloId);
    asegurarRealtimeChat(hiloId);

    function alEnfocar(): void {
        void cargarChat(hiloId);
    }
    if (typeof window !== "undefined") window.addEventListener("focus", alEnfocar);

    return () => {
        set?.delete(cb);
        if (typeof window !== "undefined") window.removeEventListener("focus", alEnfocar);
        if (!set || set.size === 0) liberarRealtimeChat(hiloId);
    };
}

/** Lee-funde-escribe `os_dm_threads.meta.carpetas`, preservando el resto de `meta`. */
async function mutarChat(hiloId: string, fn: (actuales: CarpetaHilo[], ahora: string) => CarpetaHilo[]): Promise<string | null> {
    const { meta, carpetas: actuales, error: errLectura } = await leerMetaHilo(hiloId);
    if (errLectura) return errLectura;
    const ahora = ahoraIso();
    const siguientes = fn(actuales, ahora);
    try {
        const supabase = createClient();
        const { error } = await supabase.from("os_dm_threads").update({ meta: { ...meta, carpetas: siguientes } }).eq("id", hiloId);
        if (error) return error.message || "No se pudo guardar la carpeta del chat.";
        actualizarEstadoChat(hiloId, { carpetas: siguientes, error: null });
        return null;
    } catch (e) {
        return (e as Error)?.message || "Error de red al guardar la carpeta del chat.";
    }
}

/** Reinicia el estado de las carpetas de chat/públicas (uso exclusivo de tests). */
export function resetCarpetasChatParaTests(): void {
    estadoChat.clear();
    listenersChat.clear();
    cargandoChat.clear();
    for (const unsub of unsubRealtimeChat.values()) {
        try {
            unsub();
        } catch {
            /* noop */
        }
    }
    unsubRealtimeChat.clear();
}

// ─────────────────────────── Publicar en la Biblioteca ───────────────────────────

async function publicarCarpetaEnBiblioteca(carpeta: CarpetaHilo): Promise<{ id: string | null; error: string | null }> {
    const ref = await currentUserRef();
    if (!ref) return { id: null, error: "Inicia sesión para publicar en tu Biblioteca." };
    try {
        const destino = libraryRef("user", ref.id);
        const folderId = await createFolder(destino, carpeta.nombre);
        await setFolderAcl(destino, folderId, {
            read: [],
            write: [],
            scope: "public",
            grants: [{ granteeKind: "link", granteeId: "public", role: "view" }],
            updatedAt: ahoraIso(),
        });
        for (const item of carpeta.items) {
            if (item.borrado || !item.url) continue;
            const esRuta = item.url.startsWith("/");
            await saveItem(
                destino,
                {
                    type: esRuta ? "route" : "external",
                    route: esRuta ? item.url : undefined,
                    url: esRuta ? undefined : item.url,
                    title: item.titulo || "Archivo",
                },
                folderId,
            );
        }
        return { id: folderId, error: null };
    } catch (e) {
        return { id: null, error: (e as Error)?.message || "No se pudo publicar en la Biblioteca." };
    }
}

// ─────────────────────────── Hook público ───────────────────────────

export interface CarpetasHiloApi {
    carpetas: CarpetaHilo[];
    listo: boolean;
    error: string | null;
    crear(nombre: string, visibilidad: VisibilidadCarpeta, color?: string): Promise<CarpetaHilo | null>;
    renombrar(id: string, nombre: string): Promise<void>;
    eliminar(id: string): Promise<void>;
    agregarItem(carpetaId: string, item: Omit<ItemCarpeta, "id" | "agregado" | "por">): Promise<void>;
    quitarItem(carpetaId: string, itemId: string): Promise<void>;
    publicarEnBiblioteca(carpetaId: string): Promise<string | null>;
}

export function useCarpetasHilo(hiloId: string | null): CarpetasHiloApi {
    const idEstable = hiloId ?? "";

    const stPrivadas = useSyncExternalStore(suscribirPrivadas, snapshotPrivadas, snapshotPrivadasServidor);
    const stChat = useSyncExternalStore(
        useCallback((cb: () => void) => (idEstable ? suscribirChat(idEstable, cb) : () => {}), [idEstable]),
        useCallback(() => (idEstable ? obtenerEstadoChat(idEstable) : ESTADO_CHAT_SERVIDOR), [idEstable]),
        () => ESTADO_CHAT_SERVIDOR,
    );

    const privadasDeHilo = useMemo(() => (idEstable ? vivas(stPrivadas.doc.hilos[idEstable] ?? []) : []), [stPrivadas, idEstable]);
    const chatDeHilo = useMemo(() => vivas(stChat.carpetas), [stChat]);
    const carpetas = useMemo(
        () => [...privadasDeHilo, ...chatDeHilo].sort((a, b) => (a.creado < b.creado ? -1 : a.creado > b.creado ? 1 : 0)),
        [privadasDeHilo, chatDeHilo],
    );

    const buscar = useCallback(
        (id: string): { carpeta: CarpetaHilo; enPrivada: boolean } | null => {
            const p = idEstable ? (stPrivadas.doc.hilos[idEstable] ?? []).find((c) => c.id === id) : undefined;
            if (p) return { carpeta: p, enPrivada: true };
            const c = stChat.carpetas.find((x) => x.id === id);
            return c ? { carpeta: c, enPrivada: false } : null;
        },
        [idEstable, stPrivadas, stChat],
    );

    const crear = useCallback(
        async (nombre: string, visibilidad: VisibilidadCarpeta, color = "#7C5CFF"): Promise<CarpetaHilo | null> => {
            if (!idEstable) return null;
            const ref = await currentUserRef();
            const ahora = ahoraIso();
            const nueva: CarpetaHilo = {
                id: nuevoId(),
                hiloId: idEstable,
                nombre: nombre.trim() || "Carpeta",
                color,
                visibilidad,
                creador: ref?.id ?? "",
                items: [],
                carpetaBibliotecaId: null,
                creado: ahora,
                actualizado: ahora,
                borrado: null,
            };
            if (visibilidad === "privada") {
                mutarPrivadas(idEstable, (actuales) => [...actuales, nueva]);
                return nueva;
            }
            const error = await mutarChat(idEstable, (actuales) => [...actuales, nueva]);
            if (error) {
                actualizarEstadoChat(idEstable, { error });
                return null;
            }
            return nueva;
        },
        [idEstable],
    );

    const renombrar = useCallback(
        async (id: string, nombre: string): Promise<void> => {
            const hallado = buscar(id);
            const trimmed = nombre.trim();
            if (!hallado || !idEstable || !trimmed) return;
            if (hallado.enPrivada) {
                mutarPrivadas(idEstable, (actuales, ahora) => actuales.map((c) => (c.id === id ? { ...c, nombre: trimmed, actualizado: ahora } : c)));
                return;
            }
            const error = await mutarChat(idEstable, (actuales, ahora) =>
                actuales.map((c) => (c.id === id ? { ...c, nombre: trimmed, actualizado: ahora } : c)),
            );
            if (error) actualizarEstadoChat(idEstable, { error });
        },
        [idEstable, buscar],
    );

    const eliminar = useCallback(
        async (id: string): Promise<void> => {
            const hallado = buscar(id);
            if (!hallado || !idEstable) return;
            if (hallado.enPrivada) {
                mutarPrivadas(idEstable, (actuales, ahora) =>
                    actuales.map((c) => (c.id === id ? { ...c, borrado: ahora, actualizado: ahora } : c)),
                );
                return;
            }
            const error = await mutarChat(idEstable, (actuales, ahora) =>
                actuales.map((c) => (c.id === id ? { ...c, borrado: ahora, actualizado: ahora } : c)),
            );
            if (error) actualizarEstadoChat(idEstable, { error });
        },
        [idEstable, buscar],
    );

    const agregarItem = useCallback(
        async (carpetaId: string, item: Omit<ItemCarpeta, "id" | "agregado" | "por">): Promise<void> => {
            const hallado = buscar(carpetaId);
            if (!hallado || !idEstable) return;
            const ref = await currentUserRef();
            const nuevoItem: ItemCarpeta = { ...item, id: nuevoId(), agregado: ahoraIso(), por: ref?.id ?? "" };
            if (hallado.enPrivada) {
                mutarPrivadas(idEstable, (actuales, ahora) =>
                    actuales.map((c) => (c.id === carpetaId ? { ...c, items: [...c.items, nuevoItem], actualizado: ahora } : c)),
                );
                return;
            }
            const error = await mutarChat(idEstable, (actuales, ahora) =>
                actuales.map((c) => (c.id === carpetaId ? { ...c, items: [...c.items, nuevoItem], actualizado: ahora } : c)),
            );
            if (error) actualizarEstadoChat(idEstable, { error });
        },
        [idEstable, buscar],
    );

    const quitarItem = useCallback(
        async (carpetaId: string, itemId: string): Promise<void> => {
            const hallado = buscar(carpetaId);
            if (!hallado || !idEstable) return;
            if (hallado.enPrivada) {
                mutarPrivadas(idEstable, (actuales, ahora) =>
                    actuales.map((c) =>
                        c.id === carpetaId ? { ...c, items: c.items.filter((it) => it.id !== itemId), actualizado: ahora } : c,
                    ),
                );
                return;
            }
            const error = await mutarChat(idEstable, (actuales, ahora) =>
                actuales.map((c) =>
                    c.id === carpetaId ? { ...c, items: c.items.filter((it) => it.id !== itemId), actualizado: ahora } : c,
                ),
            );
            if (error) actualizarEstadoChat(idEstable, { error });
        },
        [idEstable, buscar],
    );

    const publicarEnBiblioteca = useCallback(
        async (carpetaId: string): Promise<string | null> => {
            const hallado = buscar(carpetaId);
            if (!hallado || !idEstable) return "Carpeta no encontrada.";
            const { id: carpetaBibliotecaId, error } = await publicarCarpetaEnBiblioteca(hallado.carpeta);
            if (error) return error;
            if (hallado.enPrivada) {
                mutarPrivadas(idEstable, (actuales, ahora) =>
                    actuales.map((c) => (c.id === carpetaId ? { ...c, carpetaBibliotecaId, visibilidad: "publica", actualizado: ahora } : c)),
                );
                return null;
            }
            return mutarChat(idEstable, (actuales, ahora) =>
                actuales.map((c) => (c.id === carpetaId ? { ...c, carpetaBibliotecaId, visibilidad: "publica", actualizado: ahora } : c)),
            );
        },
        [idEstable, buscar],
    );

    return {
        carpetas,
        listo: stPrivadas.listo && (!idEstable || stChat.listo),
        error: stPrivadas.error ?? stChat.error,
        crear,
        renombrar,
        eliminar,
        agregarItem,
        quitarItem,
        publicarEnBiblioteca,
    };
}
