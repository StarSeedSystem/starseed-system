"use client";

/**
 * Store de destinos de instalación (cliente): localStorage + cuenta + aviso en vivo.
 *
 *   · localStorage `starseed.instalaciones.v1` manda en este dispositivo (funciona sin sesión).
 *   · Con sesión se funde con `user_settings.prefs.instalaciones` (misma puerta atómica que
 *     el resto: mergeUserPrefs) para que TODAS las neuronas de la cuenta vean la misma lista.
 *   · Al pedir una instalación en otra neurona se emite `app-install` por el canal de la
 *     cuenta: si esa neurona está abierta, lo ve al momento; si no, lo verá al arrancar
 *     (lee la lista sincronizada). Nunca se instala nada sin que alguien lo acepte allí.
 */

import { useSyncExternalStore } from "react";

import { createClient } from "@/utils/supabase/client";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import { onAccountBroadcast, sendAccountBroadcast } from "@/lib/sync/realtime-sync";

import { conEstado, esDestino, fusionarDestinos, type DestinoInstalacion, type EstadoDestino } from "./destinos";

export const CLAVE_INSTALACIONES = "starseed.instalaciones.v1";
export const EVENTO_INSTALACIONES = "starseed:instalaciones";
export const EVENTO_BROADCAST = "app-install";

const VACIO: DestinoInstalacion[] = [];
let cache: { raw: string; valor: DestinoInstalacion[] } = { raw: "", valor: VACIO };

function enCliente(): boolean {
    return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function leerInstalaciones(): DestinoInstalacion[] {
    if (!enCliente()) return VACIO;
    let raw = "";
    try {
        raw = localStorage.getItem(CLAVE_INSTALACIONES) ?? "";
    } catch {
        return cache.valor;
    }
    if (raw === cache.raw) return cache.valor;
    let valor: DestinoInstalacion[] = VACIO;
    try {
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        valor = Array.isArray(arr) ? arr.filter(esDestino) : VACIO;
    } catch {
        valor = VACIO;
    }
    cache = { raw, valor };
    return valor;
}

function escribir(lista: DestinoInstalacion[]): void {
    if (!enCliente()) return;
    try {
        localStorage.setItem(CLAVE_INSTALACIONES, JSON.stringify(lista));
    } catch {
        /* cuota llena / modo privado: se sigue en memoria */
    }
    try {
        window.dispatchEvent(new Event(EVENTO_INSTALACIONES));
    } catch {
        /* noop */
    }
}

function suscribir(cb: () => void): () => void {
    if (!enCliente()) return () => {};
    const alGuardar = (e: StorageEvent) => {
        if (e.key === CLAVE_INSTALACIONES || e.key === null) cb();
    };
    window.addEventListener(EVENTO_INSTALACIONES, cb);
    window.addEventListener("storage", alGuardar);
    return () => {
        window.removeEventListener(EVENTO_INSTALACIONES, cb);
        window.removeEventListener("storage", alGuardar);
    };
}

/** Lista viva de destinos (se actualiza en esta y en otras pestañas). */
export function useInstalaciones(): DestinoInstalacion[] {
    return useSyncExternalStore(suscribir, leerInstalaciones, () => VACIO);
}

async function usuarioId(): Promise<string | null> {
    try {
        const { data } = await createClient().auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Trae la lista de la cuenta, la funde con la local y sube el resultado.
 * Sin sesión o sin red no hace nada (lo local sigue mandando). Nunca lanza.
 */
export async function sincronizarInstalaciones(): Promise<DestinoInstalacion[]> {
    const local = leerInstalaciones();
    const uid = await usuarioId();
    if (!uid) return local;
    try {
        const { data } = await createClient().from("user_settings").select("prefs").eq("user_id", uid).maybeSingle();
        const prefs = (data?.prefs ?? {}) as Record<string, unknown>;
        const remota = Array.isArray(prefs.instalaciones) ? (prefs.instalaciones as unknown[]).filter(esDestino) : [];
        const fundida = fusionarDestinos(local, remota);
        escribir(fundida);
        const cambia = JSON.stringify(fundida) !== JSON.stringify(fusionarDestinos(remota, []));
        if (cambia) await mergeUserPrefs({ instalaciones: fundida }, { userId: uid });
        return fundida;
    } catch {
        return local;
    }
}

/** Añade destinos nuevos (o los reemplaza por id) y sincroniza en segundo plano. */
export function guardarDestinos(nuevos: DestinoInstalacion[]): void {
    escribir(fusionarDestinos(nuevos, leerInstalaciones()));
    const pedidos = nuevos.filter((d) => d.tipo === "neurona" && d.estado === "pedida");
    // El aviso sale DESPUÉS de subir la lista: la otra neurona, al recibirlo, sincroniza y
    // lee la cuenta. Si el aviso llegaba antes que la subida, leía la lista vieja y el
    // pedido no aparecía hasta el siguiente arranque.
    void sincronizarInstalaciones().then(() => {
        if (!pedidos.length) return;
        void sendAccountBroadcast(EVENTO_BROADCAST, {
            destinos: pedidos.map((d) => ({ id: d.id, neuronaId: d.neuronaId })),
        });
    });
}

/** Cambia el estado de un destino y lo sincroniza. */
export function marcarDestino(id: string, estado: EstadoDestino, extra: Partial<DestinoInstalacion> = {}): void {
    const lista = leerInstalaciones();
    const d = lista.find((x) => x.id === id);
    if (!d) return;
    escribir(fusionarDestinos([conEstado(d, estado, extra)], lista));
    void sincronizarInstalaciones();
}

/** Aviso en vivo: otra neurona acaba de pedir instalaciones (payload sin datos sensibles). */
export function alPedirInstalacion(cb: (neuronaIds: string[]) => void): () => void {
    return onAccountBroadcast(EVENTO_BROADCAST, (payload) => {
        const p = (payload ?? {}) as { destinos?: { neuronaId?: string }[] };
        const ids = (p.destinos ?? []).map((d) => d.neuronaId).filter((x): x is string => typeof x === "string");
        cb(ids);
    });
}
