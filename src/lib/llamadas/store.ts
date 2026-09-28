"use client";

/**
 * Almacén de las llamadas (nivel de módulo, una sola por pestaña): la llamada activa y los
 * timbres entrantes. Cualquier componente puede empezar, aceptar o colgar a través de
 * `acciones.ts`; `MontajeLlamadas` pinta lo que hay aquí.
 */
import { useSyncExternalStore } from "react";
import type { TipoLlamada } from "@/lib/mensajeria/formato-tipos";
import type { MotorLlamada } from "@/lib/llamadas/motor";
import type { AdjuntoLlamadaRegistro, EstadoLlamada } from "@/lib/llamadas/tipos";

export interface LlamadaActiva {
    sesionId: string;
    tipo: TipoLlamada;
    hiloId: string | null;
    titulo: string;
    /** Mensaje del chat que anunció la llamada (solo lo conoce quien la creó). */
    mensajeId: string | null;
    adjunto: AdjuntoLlamadaRegistro | null;
    esCreador: boolean;
    /** Token del enlace público con el que se entró (invitados). */
    token: string | null;
    unoAUno: boolean;
    motor: MotorLlamada;
    minimizada: boolean;
}

export interface TimbreEntrante {
    sesionId: string;
    tipo: TipoLlamada;
    hiloId: string;
    tipoHilo: "dm" | "grupo";
    tituloHilo: string | null;
    mensajeId: string;
    llamante: { uid: string; nombre: string; avatar: string | null };
    /** Chat silenciado o restringido: se enseña sin sonar. */
    silenciado: boolean;
    llegada: number;
}

export interface EstadoLlamadas {
    activa: LlamadaActiva | null;
    timbres: TimbreEntrante[];
    /** Cuántos `MontajeLlamadas` hay montados (la página /llamada pinta la ventana si no hay). */
    hosts: number;
}

const INICIAL: EstadoLlamadas = { activa: null, timbres: [], hosts: 0 };
let estado: EstadoLlamadas = INICIAL;
const oyentes = new Set<() => void>();

function cambiar(p: Partial<EstadoLlamadas>) {
    estado = { ...estado, ...p };
    for (const cb of Array.from(oyentes)) {
        try {
            cb();
        } catch {
            /* noop */
        }
    }
}

export function leerLlamadas(): EstadoLlamadas {
    return estado;
}

export function suscribirLlamadas(cb: () => void): () => void {
    oyentes.add(cb);
    return () => {
        oyentes.delete(cb);
    };
}

export function ponerActiva(a: LlamadaActiva) {
    cambiar({ activa: a, timbres: estado.timbres.filter((t) => t.sesionId !== a.sesionId) });
}

export function quitarActiva(a?: Pick<LlamadaActiva, "motor">) {
    // Se compara el motor: minimizar crea un objeto nuevo de la misma llamada.
    if (a && estado.activa?.motor !== a.motor) return;
    cambiar({ activa: null });
}

export function minimizarLlamada(v: boolean) {
    if (!estado.activa || estado.activa.minimizada === v) return;
    cambiar({ activa: { ...estado.activa, minimizada: v } });
}

export function agregarTimbre(t: TimbreEntrante) {
    if (estado.timbres.some((x) => x.sesionId === t.sesionId)) return;
    if (estado.activa?.sesionId === t.sesionId) return;
    // Como mucho tres a la vista: el más antiguo cede.
    cambiar({ timbres: [...estado.timbres, t].slice(-3) });
}

export function quitarTimbre(sesionId: string) {
    if (!estado.timbres.some((t) => t.sesionId === sesionId)) return;
    cambiar({ timbres: estado.timbres.filter((t) => t.sesionId !== sesionId) });
}

/** Registra un host global de la interfaz de llamadas; devuelve la baja. */
export function registrarHost(): () => void {
    cambiar({ hosts: estado.hosts + 1 });
    let dado = false;
    return () => {
        if (dado) return;
        dado = true;
        cambiar({ hosts: Math.max(0, estado.hosts - 1) });
    };
}

/** Solo pruebas. */
export function __reiniciarLlamadas() {
    estado = INICIAL;
}

/* ───────────────────────────── Hooks ───────────────────────────── */

export function useLlamadas(): EstadoLlamadas {
    return useSyncExternalStore(suscribirLlamadas, leerLlamadas, () => INICIAL);
}

const sinSuscripcion = () => () => undefined;
const nulo = () => null;

/** Estado vivo del motor de una llamada (null sin motor). */
export function useEstadoMotor(motor: MotorLlamada | null | undefined): EstadoLlamada | null {
    return useSyncExternalStore(motor ? motor.suscribir : sinSuscripcion, motor ? motor.estado : nulo, nulo);
}
