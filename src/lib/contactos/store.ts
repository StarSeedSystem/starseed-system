"use client";

/**
 * store — almacén compartido de la libreta de Contactos (`useContactos`) y de
 * las notas por persona (`useNotasContacto`). Local-first: toda escritura
 * actualiza memoria + localStorage al instante y programa un guardado
 * debounced (800 ms) a `entity_state` (dueño `{kind:"user", id:uid}`); el
 * aviso entre dispositivos va por `live-signal` (nunca por `postgres_changes`:
 * la libreta no tiene tabla propia, es un documento de `entity_state`).
 *
 * Estado módulo-nivel (no por componente) para que TODOS los que llamen a
 * `useContactos()`/`useNotasContacto()` compartan una única fuente de verdad,
 * al estilo de `library-store.ts`/`entity-library.ts` pero a menor escala.
 */

import { useMemo, useSyncExternalStore } from "react";

import {
    aplicarCambios,
    crearContacto,
    fusionarContactos,
    fusionarDocs,
    normalizarTelefono,
    nuevoId,
    vivos,
} from "@/lib/contactos/modelo";
import { crearNota, editarNota, fusionarNotas, notasVivas } from "@/lib/contactos/notas";
import { leerSeguidosPersonas } from "@/lib/contactos/migrar-seguidos";
import { publicarContacto, retirarContacto, etiquetaDeRelacion } from "@/lib/contactos/publicos";
import {
    currentUserRef,
    getEntityStateChecked,
    setEntityStateChecked,
    type EntityRef,
} from "@/lib/sync/entity-state";
import { emitChange, onChange } from "@/lib/sync/live-signal";
import {
    CLAVE_CONTACTOS,
    DOC_VACIO,
    claveNotas,
    temaContactos,
    type CategoriaContactos,
    type Contacto,
    type ContactoEntrada,
    type ContactosApi,
    type ContactosDoc,
    type ListaContactos,
    type NotaContacto,
    type NotasApi,
    type NotasDoc,
    type TipoNota,
    type VisibilidadContacto,
} from "@/lib/contactos/tipos";

const DEBOUNCE_MS = 800;

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function ahoraIso(): string {
    return new Date().toISOString();
}

// ─────────────────────────── Cache local (documento principal) ───────────────────────────

function claveCacheDoc(uid: string): string {
    return `starseed.contactos.v1.${uid}`;
}
function clavePendienteDoc(uid: string): string {
    return `starseed.contactos.pendiente.v1.${uid}`;
}

function normalizarDoc(raw: Partial<ContactosDoc> | null | undefined): ContactosDoc {
    if (!raw) return { ...DOC_VACIO };
    return {
        v: 1,
        contactos: Array.isArray(raw.contactos) ? raw.contactos : [],
        categorias: Array.isArray(raw.categorias) ? raw.categorias : [],
        listas: Array.isArray(raw.listas) ? raw.listas : [],
        migradoSeguidos: Boolean(raw.migradoSeguidos),
        actualizado: typeof raw.actualizado === "string" ? raw.actualizado : DOC_VACIO.actualizado,
    };
}

function leerCacheDoc(uid: string): ContactosDoc {
    if (!isClient()) return { ...DOC_VACIO };
    try {
        const raw = localStorage.getItem(claveCacheDoc(uid));
        if (!raw) return { ...DOC_VACIO };
        return normalizarDoc(JSON.parse(raw) as Partial<ContactosDoc>);
    } catch {
        return { ...DOC_VACIO };
    }
}

function escribirCacheDoc(uid: string, doc: ContactosDoc): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(claveCacheDoc(uid), JSON.stringify(doc));
    } catch {
        /* cuota / modo privado: se degrada en silencio, sigue en memoria */
    }
}

function marcarPendienteDoc(uid: string, pendiente: boolean): void {
    if (!isClient()) return;
    try {
        if (pendiente) localStorage.setItem(clavePendienteDoc(uid), "1");
        else localStorage.removeItem(clavePendienteDoc(uid));
    } catch {
        /* noop */
    }
}
function hayPendienteDoc(uid: string): boolean {
    if (!isClient()) return false;
    try {
        return localStorage.getItem(clavePendienteDoc(uid)) === "1";
    } catch {
        return false;
    }
}

// ─────────────────────────── Estado compartido (libreta) ───────────────────────────

interface EstadoContactos {
    listo: boolean;
    sinSesion: boolean;
    uid: string | null;
    doc: ContactosDoc;
    error: string | null;
}

const ESTADO_INICIAL: EstadoContactos = { listo: false, sinSesion: false, uid: null, doc: DOC_VACIO, error: null };
const ESTADO_SERVIDOR: EstadoContactos = ESTADO_INICIAL;

let estado: EstadoContactos = ESTADO_INICIAL;
const listeners = new Set<() => void>();

function notificar(): void {
    for (const cb of listeners) {
        try {
            cb();
        } catch {
            /* un listener roto no debe tirar al resto */
        }
    }
}
function actualizarEstado(patch: Partial<EstadoContactos>): void {
    estado = { ...estado, ...patch };
    notificar();
}
function snapshot(): EstadoContactos {
    return estado;
}
function snapshotServidor(): EstadoContactos {
    return ESTADO_SERVIDOR;
}

let temporizadorGuardado: ReturnType<typeof setTimeout> | null = null;
let unsubscribeLive: (() => void) | null = null;
let reintentoArmado = false;
let inicializando = false;
let inicializado = false;

function armarReintento(): void {
    if (!isClient() || reintentoArmado) return;
    reintentoArmado = true;
    window.addEventListener("online", () => {
        if (estado.uid && hayPendienteDoc(estado.uid)) void guardarEnNube(estado.uid);
    });
}

function suscribirLive(uid: string): void {
    if (unsubscribeLive) return;
    unsubscribeLive = onChange(temaContactos(uid), () => {
        void refrescarDesdeNube(uid);
    });
}

async function refrescarDesdeNube(uid: string): Promise<void> {
    const ref: EntityRef = { kind: "user", id: uid };
    try {
        const { row, error } = await getEntityStateChecked<ContactosDoc>(ref, CLAVE_CONTACTOS);
        if (error) {
            if (estado.uid === uid) actualizarEstado({ error });
            return;
        }
        if (!row) return;
        const remoto = normalizarDoc(row.value as Partial<ContactosDoc>);
        const local = leerCacheDoc(uid);
        const fundido = fusionarDocs(local, remoto);
        escribirCacheDoc(uid, fundido);
        if (estado.uid === uid) actualizarEstado({ doc: fundido, error: null });
    } catch {
        /* best-effort: el próximo cambio o el reintento ya lo trae */
    }
}

function programarGuardado(uid: string): void {
    if (temporizadorGuardado) clearTimeout(temporizadorGuardado);
    temporizadorGuardado = setTimeout(() => {
        temporizadorGuardado = null;
        void guardarEnNube(uid);
    }, DEBOUNCE_MS);
}

async function guardarEnNube(uid: string): Promise<void> {
    const ref: EntityRef = { kind: "user", id: uid };
    const local = leerCacheDoc(uid);
    try {
        const { row: remotoRow } = await getEntityStateChecked<ContactosDoc>(ref, CLAVE_CONTACTOS);
        const remoto = remotoRow ? normalizarDoc(remotoRow.value as Partial<ContactosDoc>) : null;
        const aFundir = remoto ? fusionarDocs(local, remoto) : local;
        const { row, error } = await setEntityStateChecked<ContactosDoc>(ref, CLAVE_CONTACTOS, aFundir);
        if (row) {
            marcarPendienteDoc(uid, false);
            escribirCacheDoc(uid, aFundir);
            if (estado.uid === uid) actualizarEstado({ doc: aFundir, error: null });
            void emitChange(temaContactos(uid));
        } else {
            marcarPendienteDoc(uid, true);
            if (estado.uid === uid) actualizarEstado({ error: error ?? "No se pudo guardar en la nube." });
        }
    } catch (e) {
        marcarPendienteDoc(uid, true);
        if (estado.uid === uid) actualizarEstado({ error: (e as Error)?.message || "Error de red al guardar en la nube." });
    }
}

async function migrarSeguidosSiHaceFalta(uid: string, docActual: ContactosDoc): Promise<void> {
    try {
        const entradas = await leerSeguidosPersonas(uid);
        const ahora = ahoraIso();
        let doc = docActual;
        for (const entrada of entradas) {
            if (entrada.userId && doc.contactos.some((c) => c.userId === entrada.userId && !c.borrado)) continue;
            doc = { ...doc, contactos: [...doc.contactos, crearContacto(entrada, ahora)] };
        }
        doc = { ...doc, migradoSeguidos: true, actualizado: ahora };
        escribirCacheDoc(uid, doc);
        if (estado.uid === uid) actualizarEstado({ doc });
        marcarPendienteDoc(uid, true);
        programarGuardado(uid);
    } catch {
        // best-effort: si falla, `migradoSeguidos` sigue false y se reintenta en el próximo `inicializar()`.
    }
}

async function inicializar(): Promise<void> {
    if (typeof window === "undefined" || inicializado || inicializando) return;
    inicializando = true;
    try {
        const ref = await currentUserRef();
        if (!ref) {
            actualizarEstado({ listo: true, sinSesion: true, uid: null, doc: { ...DOC_VACIO }, error: null });
            return;
        }
        const uid = ref.id;
        const local = leerCacheDoc(uid);
        actualizarEstado({ listo: true, sinSesion: false, uid, doc: local, error: null });
        armarReintento();
        suscribirLive(uid);

        let doc = local;
        const { row, error } = await getEntityStateChecked<ContactosDoc>({ kind: "user", id: uid }, CLAVE_CONTACTOS);
        if (error) {
            if (estado.uid === uid) actualizarEstado({ error });
        } else if (row) {
            doc = fusionarDocs(local, normalizarDoc(row.value as Partial<ContactosDoc>));
            escribirCacheDoc(uid, doc);
            if (estado.uid === uid) actualizarEstado({ doc, error: null });
        }

        if (!doc.migradoSeguidos) await migrarSeguidosSiHaceFalta(uid, doc);
        if (hayPendienteDoc(uid)) void guardarEnNube(uid);
    } finally {
        inicializando = false;
        inicializado = true;
    }
}

function suscribir(cb: () => void): () => void {
    listeners.add(cb);
    if (typeof window !== "undefined" && !inicializado && !inicializando) void inicializar();
    return () => {
        listeners.delete(cb);
    };
}

// ─────────────────────────── Mutaciones (libreta) ───────────────────────────

function mutarDoc(fn: (doc: ContactosDoc, ahora: string) => ContactosDoc): void {
    const uid = estado.uid;
    if (!uid) return;
    const ahora = ahoraIso();
    const siguiente = fn(estado.doc, ahora);
    escribirCacheDoc(uid, siguiente);
    actualizarEstado({ doc: siguiente });
    marcarPendienteDoc(uid, true);
    programarGuardado(uid);
}

function crear(entrada: ContactoEntrada): Contacto {
    const ahora = ahoraIso();
    const nuevo = crearContacto(entrada, ahora);
    mutarDoc((doc) => ({ ...doc, contactos: [...doc.contactos, nuevo], actualizado: ahora }));
    return nuevo;
}

function actualizar(id: string, cambios: Partial<ContactoEntrada>): void {
    mutarDoc((doc, ahora) => ({
        ...doc,
        contactos: doc.contactos.map((c) => (c.id === id ? aplicarCambios(c, cambios, ahora) : c)),
        actualizado: ahora,
    }));
}

function eliminar(id: string): void {
    const uid = estado.uid;
    const contacto = estado.doc.contactos.find((c) => c.id === id);
    mutarDoc((doc, ahora) => ({
        ...doc,
        contactos: doc.contactos.map((c) => (c.id === id ? { ...c, borrado: ahora, actualizado: ahora } : c)),
        actualizado: ahora,
    }));
    if (uid && contacto?.visibilidad === "publica" && contacto.userId) {
        void retirarContacto(uid, contacto.userId);
    }
}

function alternarFavorito(id: string): void {
    mutarDoc((doc, ahora) => ({
        ...doc,
        contactos: doc.contactos.map((c) => (c.id === id ? { ...c, favorito: !c.favorito, actualizado: ahora } : c)),
        actualizado: ahora,
    }));
}

async function cambiarVisibilidad(id: string, v: VisibilidadContacto): Promise<string | null> {
    const uid = estado.uid;
    if (!uid) return "Sin sesión: no se puede cambiar la visibilidad.";
    const contacto = estado.doc.contactos.find((c) => c.id === id);
    if (!contacto) return "Contacto no encontrado.";
    if (v === "publica" && !contacto.userId) {
        return "Solo un contacto con cuenta StarSeed puede ser público.";
    }
    mutarDoc((doc, ahora) => ({
        ...doc,
        contactos: doc.contactos.map((c) => (c.id === id ? { ...c, visibilidad: v, actualizado: ahora } : c)),
        actualizado: ahora,
    }));
    if (contacto.userId) {
        const error =
            v === "publica"
                ? await publicarContacto(uid, contacto.userId, etiquetaDeRelacion(contacto.relacion))
                : await retirarContacto(uid, contacto.userId);
        if (error) {
            actualizarEstado({ error });
            return error;
        }
    }
    return null;
}

function crearCategoria(nombre: string, color = "#A78BFA"): CategoriaContactos {
    const ahora = ahoraIso();
    const nueva: CategoriaContactos = {
        id: nuevoId(),
        nombre: nombre.trim(),
        color,
        creado: ahora,
        actualizado: ahora,
        borrado: null,
    };
    mutarDoc((doc) => ({ ...doc, categorias: [...doc.categorias, nueva], actualizado: ahora }));
    return nueva;
}

function editarCategoria(id: string, cambios: Partial<Pick<CategoriaContactos, "nombre" | "color">>): void {
    mutarDoc((doc, ahora) => ({
        ...doc,
        categorias: doc.categorias.map((c) => (c.id === id ? { ...c, ...cambios, actualizado: ahora } : c)),
        actualizado: ahora,
    }));
}

function eliminarCategoria(id: string): void {
    mutarDoc((doc, ahora) => ({
        ...doc,
        categorias: doc.categorias.map((c) => (c.id === id ? { ...c, borrado: ahora, actualizado: ahora } : c)),
        contactos: doc.contactos.map((c) =>
            c.categorias.includes(id) ? { ...c, categorias: c.categorias.filter((x) => x !== id), actualizado: ahora } : c,
        ),
        actualizado: ahora,
    }));
}

function crearLista(nombre: string, color = "#39FF14", descripcion?: string): ListaContactos {
    const ahora = ahoraIso();
    const nueva: ListaContactos = {
        id: nuevoId(),
        nombre: nombre.trim(),
        color,
        descripcion: descripcion?.trim() || undefined,
        creado: ahora,
        actualizado: ahora,
        borrado: null,
    };
    mutarDoc((doc) => ({ ...doc, listas: [...doc.listas, nueva], actualizado: ahora }));
    return nueva;
}

function editarLista(id: string, cambios: Partial<Pick<ListaContactos, "nombre" | "color" | "descripcion">>): void {
    mutarDoc((doc, ahora) => ({
        ...doc,
        listas: doc.listas.map((l) => (l.id === id ? { ...l, ...cambios, actualizado: ahora } : l)),
        actualizado: ahora,
    }));
}

function eliminarLista(id: string): void {
    mutarDoc((doc, ahora) => ({
        ...doc,
        listas: doc.listas.map((l) => (l.id === id ? { ...l, borrado: ahora, actualizado: ahora } : l)),
        contactos: doc.contactos.map((c) =>
            c.listas.includes(id) ? { ...c, listas: c.listas.filter((x) => x !== id), actualizado: ahora } : c,
        ),
        actualizado: ahora,
    }));
}

function encontrarExistente(contactos: Contacto[], entrada: ContactoEntrada): Contacto | undefined {
    const actuales = vivos(contactos);
    if (entrada.userId) {
        const porUid = actuales.find((c) => c.userId === entrada.userId);
        if (porUid) return porUid;
    }
    const telefono = entrada.telefonos?.[0]?.valor;
    if (telefono) {
        const norm = normalizarTelefono(telefono);
        const porTel = actuales.find((c) => c.telefonos.some((t) => normalizarTelefono(t.valor) === norm));
        if (porTel) return porTel;
    }
    const correo = entrada.correos?.[0]?.valor?.trim().toLowerCase();
    if (correo) {
        const porCorreo = actuales.find((c) => c.correos.some((e) => e.valor.trim().toLowerCase() === correo));
        if (porCorreo) return porCorreo;
    }
    return undefined;
}

function importar(entradas: ContactoEntrada[]): { nuevos: number; fusionados: number } {
    let nuevos = 0;
    let fusionados = 0;
    mutarDoc((doc, ahora) => {
        let contactos = doc.contactos;
        for (const entrada of entradas) {
            const existente = encontrarExistente(contactos, entrada);
            if (existente) {
                const candidato = crearContacto(entrada, ahora);
                const fundido = fusionarContactos(existente, candidato, ahora);
                contactos = contactos.map((c) => (c.id === existente.id ? fundido : c));
                fusionados++;
            } else {
                contactos = [...contactos, crearContacto(entrada, ahora)];
                nuevos++;
            }
        }
        return { ...doc, contactos, actualizado: ahora };
    });
    return { nuevos, fusionados };
}

/** Reinicia TODO el estado del módulo (uso exclusivo de tests). */
export function resetStoreParaTests(): void {
    estado = { ...ESTADO_INICIAL };
    inicializado = false;
    inicializando = false;
    reintentoArmado = false;
    if (temporizadorGuardado) {
        clearTimeout(temporizadorGuardado);
        temporizadorGuardado = null;
    }
    if (unsubscribeLive) {
        try {
            unsubscribeLive();
        } catch {
            /* noop */
        }
        unsubscribeLive = null;
    }
    listeners.clear();
    notasEstado.clear();
    notasListeners.clear();
    for (const t of notasTimers.values()) clearTimeout(t);
    notasTimers.clear();
    notasCargando.clear();
}

export function useContactos(): ContactosApi {
    const st = useSyncExternalStore(suscribir, snapshot, snapshotServidor);

    return useMemo<ContactosApi>(
        () => ({
            listo: st.listo,
            sinSesion: st.sinSesion,
            contactos: vivos(st.doc.contactos),
            categorias: vivos(st.doc.categorias),
            listas: vivos(st.doc.listas),
            error: st.error,
            porId: (id) => st.doc.contactos.find((c) => c.id === id && !c.borrado),
            porUserId: (userId) => st.doc.contactos.find((c) => c.userId === userId && !c.borrado),
            crear,
            actualizar,
            eliminar,
            alternarFavorito,
            cambiarVisibilidad,
            crearCategoria,
            editarCategoria,
            eliminarCategoria,
            crearLista,
            editarLista,
            eliminarLista,
            importar,
        }),
        [st],
    );
}

/** Conveniencia: el contacto (vivo) vinculado a esa cuenta StarSeed, si existe. */
export function usePorUserId(userId?: string | null): Contacto | undefined {
    const st = useSyncExternalStore(suscribir, snapshot, snapshotServidor);
    if (!userId) return undefined;
    return st.doc.contactos.find((c) => c.userId === userId && !c.borrado);
}

// ─────────────────────────── Notas por contacto ───────────────────────────

interface EstadoNotas {
    listo: boolean;
    doc: NotasDoc;
    error: string | null;
}

function docNotasVacio(contactoId: string): NotasDoc {
    return { v: 1, contactoId, notas: [], actualizado: DOC_VACIO.actualizado };
}
const ESTADO_NOTAS_SERVIDOR: EstadoNotas = { listo: false, doc: docNotasVacio(""), error: null };

const notasEstado = new Map<string, EstadoNotas>();
const notasListeners = new Map<string, Set<() => void>>();
const notasTimers = new Map<string, ReturnType<typeof setTimeout>>();
const notasCargando = new Set<string>();

function obtenerEstadoNotas(contactoId: string): EstadoNotas {
    return notasEstado.get(contactoId) ?? { listo: false, doc: docNotasVacio(contactoId), error: null };
}
function actualizarEstadoNotas(contactoId: string, patch: Partial<EstadoNotas>): void {
    notasEstado.set(contactoId, { ...obtenerEstadoNotas(contactoId), ...patch });
    const set = notasListeners.get(contactoId);
    if (set) for (const cb of set) {
        try {
            cb();
        } catch {
            /* noop */
        }
    }
}

function claveCacheNotas(uid: string, contactoId: string): string {
    return `starseed.contactos.notas.v1.${uid}.${contactoId}`;
}

function normalizarDocNotas(raw: Partial<NotasDoc> | null | undefined, contactoId: string): NotasDoc {
    if (!raw) return docNotasVacio(contactoId);
    return {
        v: 1,
        contactoId,
        notas: Array.isArray(raw.notas) ? raw.notas : [],
        actualizado: typeof raw.actualizado === "string" ? raw.actualizado : docNotasVacio(contactoId).actualizado,
    };
}

function leerCacheNotas(uid: string, contactoId: string): NotasDoc {
    if (!isClient()) return docNotasVacio(contactoId);
    try {
        const raw = localStorage.getItem(claveCacheNotas(uid, contactoId));
        if (!raw) return docNotasVacio(contactoId);
        return normalizarDocNotas(JSON.parse(raw) as Partial<NotasDoc>, contactoId);
    } catch {
        return docNotasVacio(contactoId);
    }
}
function escribirCacheNotas(uid: string, contactoId: string, doc: NotasDoc): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(claveCacheNotas(uid, contactoId), JSON.stringify(doc));
    } catch {
        /* noop */
    }
}

async function cargarNotas(contactoId: string): Promise<void> {
    if (notasCargando.has(contactoId)) return;
    const uid = estado.uid;
    if (!uid) {
        actualizarEstadoNotas(contactoId, { listo: true });
        return;
    }
    notasCargando.add(contactoId);
    try {
        const local = leerCacheNotas(uid, contactoId);
        actualizarEstadoNotas(contactoId, { listo: true, doc: local, error: null });
        const { row, error } = await getEntityStateChecked<NotasDoc>({ kind: "user", id: uid }, claveNotas(contactoId));
        if (error) {
            actualizarEstadoNotas(contactoId, { error });
            return;
        }
        if (row) {
            const remoto = normalizarDocNotas(row.value as Partial<NotasDoc>, contactoId);
            const fundido = fusionarNotas(local, remoto);
            escribirCacheNotas(uid, contactoId, fundido);
            actualizarEstadoNotas(contactoId, { doc: fundido, error: null });
        }
    } finally {
        notasCargando.delete(contactoId);
    }
}

function programarGuardadoNotas(contactoId: string): void {
    const anterior = notasTimers.get(contactoId);
    if (anterior) clearTimeout(anterior);
    notasTimers.set(
        contactoId,
        setTimeout(() => {
            notasTimers.delete(contactoId);
            void guardarNotasEnNube(contactoId);
        }, DEBOUNCE_MS),
    );
}

async function guardarNotasEnNube(contactoId: string): Promise<void> {
    const uid = estado.uid;
    if (!uid) return;
    const ref: EntityRef = { kind: "user", id: uid };
    const clave = claveNotas(contactoId);
    const local = leerCacheNotas(uid, contactoId);
    try {
        const { row: remotoRow } = await getEntityStateChecked<NotasDoc>(ref, clave);
        const remoto = remotoRow ? normalizarDocNotas(remotoRow.value as Partial<NotasDoc>, contactoId) : null;
        const aFundir = remoto ? fusionarNotas(local, remoto) : local;
        const { row, error } = await setEntityStateChecked<NotasDoc>(ref, clave, aFundir);
        if (row) {
            escribirCacheNotas(uid, contactoId, aFundir);
            actualizarEstadoNotas(contactoId, { doc: aFundir, error: null });
            void emitChange(temaContactos(uid));
        } else {
            actualizarEstadoNotas(contactoId, { error: error ?? "No se pudo guardar la nota en la nube." });
        }
    } catch (e) {
        actualizarEstadoNotas(contactoId, { error: (e as Error)?.message || "Error de red al guardar la nota." });
    }
}

function mutarNotas(contactoId: string, fn: (doc: NotasDoc, ahora: string) => NotasDoc): void {
    const uid = estado.uid;
    if (!uid) return;
    const ahora = ahoraIso();
    const siguiente = fn(obtenerEstadoNotas(contactoId).doc, ahora);
    escribirCacheNotas(uid, contactoId, siguiente);
    actualizarEstadoNotas(contactoId, { doc: siguiente });
    programarGuardadoNotas(contactoId);
}

function agregarNota(
    contactoId: string,
    n: { texto: string; tipo?: TipoNota; fecha?: string; etiquetas?: string[] },
): NotaContacto {
    const ahora = ahoraIso();
    const nueva = crearNota(n, ahora);
    mutarNotas(contactoId, (doc) => ({ ...doc, notas: [...doc.notas, nueva], actualizado: ahora }));
    return nueva;
}

function editarNotaEnDoc(
    contactoId: string,
    id: string,
    cambios: Partial<Pick<NotaContacto, "texto" | "tipo" | "fecha" | "etiquetas">>,
): void {
    mutarNotas(contactoId, (doc, ahora) => ({
        ...doc,
        notas: doc.notas.map((n) => (n.id === id ? editarNota(n, cambios, ahora) : n)),
        actualizado: ahora,
    }));
}

function eliminarNota(contactoId: string, id: string): void {
    mutarNotas(contactoId, (doc, ahora) => ({
        ...doc,
        notas: doc.notas.map((n) => (n.id === id ? { ...n, borrado: ahora, actualizado: ahora } : n)),
        actualizado: ahora,
    }));
}

function suscribirNotasDe(contactoId: string, cb: () => void): () => void {
    let set = notasListeners.get(contactoId);
    if (!set) {
        set = new Set();
        notasListeners.set(contactoId, set);
    }
    set.add(cb);
    if (typeof window !== "undefined" && !obtenerEstadoNotas(contactoId).listo) void cargarNotas(contactoId);
    return () => {
        set?.delete(cb);
    };
}

export function useNotasContacto(contactoId: string | null): NotasApi {
    const idEstable = contactoId ?? "";
    const st = useSyncExternalStore(
        (cb) => (idEstable ? suscribirNotasDe(idEstable, cb) : () => {}),
        () => (idEstable ? obtenerEstadoNotas(idEstable) : ESTADO_NOTAS_SERVIDOR),
        () => ESTADO_NOTAS_SERVIDOR,
    );

    return useMemo<NotasApi>(
        () => ({
            listo: st.listo,
            notas: notasVivas(st.doc),
            error: st.error,
            agregar: (n) => agregarNota(idEstable, n),
            editar: (id, cambios) => editarNotaEnDoc(idEstable, id, cambios),
            eliminar: (id) => eliminarNota(idEstable, id),
        }),
        [st, idEstable],
    );
}
