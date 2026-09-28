"use client";

/**
 * ajustes-store — almacén compartido de `AjustesMensajeria` (`useAjustesMensajeria`).
 * Local-first, al estilo de `@/lib/contactos/store.ts`: toda escritura actualiza
 * memoria + localStorage al instante y programa un guardado debounced (800 ms) a
 * `entity_state` (dueño `{kind:"user", id:uid}`, clave `CLAVE_MENSAJERIA`); el aviso
 * entre dispositivos va por `live-signal`. Sin sesión: solo local (clave `.anon`).
 *
 * Estado módulo-nivel (no por componente) para que TODOS los que llamen a
 * `useAjustesMensajeria()` compartan una única fuente de verdad.
 */

import { useMemo, useSyncExternalStore } from "react";

import { ajustesEfectivos, fusionarConDefecto, fusionarDocsAjustes } from "@/lib/mensajeria/ajustes";
import {
    AJUSTES_DEFECTO,
    CLAVE_MENSAJERIA,
    LS_MENSAJERIA,
    type AjustesHilo,
    type AjustesMensajeria,
    type AjustesMensajeriaApi,
} from "@/lib/mensajeria/ajustes-tipos";
import { currentUserRef, getEntityStateChecked, setEntityStateChecked, type EntityRef } from "@/lib/sync/entity-state";
import { emitChange, onChange } from "@/lib/sync/live-signal";

const DEBOUNCE_MS = 800;

function isClient(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}
function ahoraIso(): string {
    return new Date().toISOString();
}
function claveDeUid(uid: string | null): string {
    return uid ?? "anon";
}
function temaAjustes(uid: string): string {
    return `mensajeria:${uid}`;
}
function claveCache(uidOAnon: string): string {
    return `${LS_MENSAJERIA}.${uidOAnon}`;
}

function leerCache(uidOAnon: string): AjustesMensajeria {
    if (!isClient()) return { ...AJUSTES_DEFECTO };
    try {
        const raw = localStorage.getItem(claveCache(uidOAnon));
        if (!raw) return { ...AJUSTES_DEFECTO };
        return fusionarConDefecto(JSON.parse(raw));
    } catch {
        return { ...AJUSTES_DEFECTO };
    }
}
function escribirCache(uidOAnon: string, doc: AjustesMensajeria): void {
    if (!isClient()) return;
    try {
        localStorage.setItem(claveCache(uidOAnon), JSON.stringify(doc));
    } catch {
        /* cuota / modo privado: se degrada en silencio, sigue en memoria */
    }
}

interface Estado {
    listo: boolean;
    uid: string | null;
    ajustes: AjustesMensajeria;
}
const ESTADO_INICIAL: Estado = { listo: false, uid: null, ajustes: { ...AJUSTES_DEFECTO } };
const ESTADO_SERVIDOR: Estado = ESTADO_INICIAL;

let estado: Estado = ESTADO_INICIAL;
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
function actualizarEstado(patch: Partial<Estado>): void {
    estado = { ...estado, ...patch };
    notificar();
}
function snapshot(): Estado {
    return estado;
}
function snapshotServidor(): Estado {
    return ESTADO_SERVIDOR;
}

let temporizador: ReturnType<typeof setTimeout> | null = null;
let unsubscribeLive: (() => void) | null = null;
let inicializando = false;
let inicializado = false;

function suscribirLive(uid: string): void {
    if (unsubscribeLive) return;
    unsubscribeLive = onChange(temaAjustes(uid), () => {
        void refrescarDesdeNube(uid);
    });
}

async function refrescarDesdeNube(uid: string): Promise<void> {
    const ref: EntityRef = { kind: "user", id: uid };
    try {
        const { row, error } = await getEntityStateChecked<AjustesMensajeria>(ref, CLAVE_MENSAJERIA);
        if (error || !row) return;
        const remoto = fusionarConDefecto(row.value);
        const local = leerCache(uid);
        const fundido = fusionarDocsAjustes(local, remoto);
        escribirCache(uid, fundido);
        if (estado.uid === uid) actualizarEstado({ ajustes: fundido });
    } catch {
        /* best-effort: el próximo cambio o el live-signal ya lo trae */
    }
}

function programarGuardado(uid: string): void {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
        temporizador = null;
        void guardarEnNube(uid);
    }, DEBOUNCE_MS);
}

async function guardarEnNube(uid: string): Promise<void> {
    const ref: EntityRef = { kind: "user", id: uid };
    const local = leerCache(uid);
    try {
        const { row: remotoRow } = await getEntityStateChecked<AjustesMensajeria>(ref, CLAVE_MENSAJERIA);
        const remoto = remotoRow ? fusionarConDefecto(remotoRow.value) : null;
        const aFundir = remoto ? fusionarDocsAjustes(local, remoto) : local;
        const { row } = await setEntityStateChecked<AjustesMensajeria>(ref, CLAVE_MENSAJERIA, aFundir);
        if (row) {
            escribirCache(uid, aFundir);
            if (estado.uid === uid) actualizarEstado({ ajustes: aFundir });
            void emitChange(temaAjustes(uid));
        }
    } catch {
        /* best-effort: se reintenta en el siguiente cambio */
    }
}

async function inicializar(): Promise<void> {
    if (typeof window === "undefined" || inicializado || inicializando) return;
    inicializando = true;
    try {
        const ref = await currentUserRef();
        const uid = ref?.id ?? null;
        const clave = claveDeUid(uid);
        const local = leerCache(clave);
        actualizarEstado({ listo: true, uid, ajustes: local });
        if (!uid) return; // sin sesión: solo local

        suscribirLive(uid);
        const { row, error } = await getEntityStateChecked<AjustesMensajeria>({ kind: "user", id: uid }, CLAVE_MENSAJERIA);
        if (!error && row) {
            const fundido = fusionarDocsAjustes(local, fusionarConDefecto(row.value));
            escribirCache(uid, fundido);
            if (estado.uid === uid) actualizarEstado({ ajustes: fundido });
        }
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

function mutar(fn: (doc: AjustesMensajeria, ahora: string) => AjustesMensajeria): void {
    const clave = claveDeUid(estado.uid);
    const ahora = ahoraIso();
    const siguiente = fn(estado.ajustes, ahora);
    escribirCache(clave, siguiente);
    actualizarEstado({ ajustes: siguiente });
    if (estado.uid) programarGuardado(estado.uid);
}

function cambiar<K extends Exclude<keyof AjustesMensajeria, "v" | "hilos" | "actualizado">>(
    bloque: K,
    cambios: Partial<AjustesMensajeria[K]>,
): void {
    mutar((doc, ahora) => ({
        ...doc,
        [bloque]: { ...(doc[bloque] as Record<string, unknown>), ...(cambios as Record<string, unknown>) } as AjustesMensajeria[K],
        actualizado: ahora,
    }));
}

function cambiarHilo(hiloId: string, cambios: AjustesHilo): void {
    mutar((doc, ahora) => {
        const previo = doc.hilos[hiloId] ?? {};
        const siguiente: AjustesHilo = {
            ...previo,
            ...cambios,
            apariencia: cambios.apariencia !== undefined ? { ...previo.apariencia, ...cambios.apariencia } : previo.apariencia,
            notificaciones:
                cambios.notificaciones !== undefined ? { ...previo.notificaciones, ...cambios.notificaciones } : previo.notificaciones,
            actualizado: ahora,
        };
        return { ...doc, hilos: { ...doc.hilos, [hiloId]: siguiente }, actualizado: ahora };
    });
}

function restablecerHilo(hiloId: string): void {
    mutar((doc, ahora) => {
        const hilos = { ...doc.hilos };
        delete hilos[hiloId];
        return { ...doc, hilos, actualizado: ahora };
    });
}

function restablecerTodo(): void {
    mutar((_doc, ahora) => ({ ...AJUSTES_DEFECTO, hilos: {}, actualizado: ahora }));
}

/** Reinicia TODO el estado del módulo (uso exclusivo de tests). */
export function resetAjustesParaTests(): void {
    estado = { ...ESTADO_INICIAL, ajustes: { ...AJUSTES_DEFECTO } };
    inicializado = false;
    inicializando = false;
    if (temporizador) {
        clearTimeout(temporizador);
        temporizador = null;
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
}

export function useAjustesMensajeria(): AjustesMensajeriaApi {
    const st = useSyncExternalStore(suscribir, snapshot, snapshotServidor);

    return useMemo<AjustesMensajeriaApi>(
        () => ({
            listo: st.listo,
            ajustes: st.ajustes,
            cambiar,
            cambiarHilo,
            restablecerHilo,
            efectivos: (hiloId, tipo) => ajustesEfectivos(st.ajustes, hiloId, tipo),
            restablecerTodo,
        }),
        [st],
    );
}
