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
import { marcarOcupado } from "@/lib/actualizaciones/momento-navegador";
import { silenciarTodos } from "./timbre-sonido";

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
    /** (GRP1107A) Por dónde va, dicho en la ventana («Mesh · Sin internet · malla completa · …»). */
    via?: string;
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
    /**
     * (GRP1107A) Invitación de grupo por la malla (sin servidor): el enlace por el que llegó, los
     * miembros de la llamada y si quien llama la propuso con vídeo.
     */
    malla?: { enlaceId: string; miembros: string[]; video: boolean };
    /** (LLA1108E) Neurona que llama (si el timbre vino de un chat de neurona): con ella se contesta aunque solo haya Bluetooth. */
    neurona?: string;
}

export interface EstadoLlamadas {
    activa: LlamadaActiva | null;
    timbres: TimbreEntrante[];
    /** Cuántos `MontajeLlamadas` hay montados (la página /llamada pinta la ventana si no hay). */
    hosts: number;
}

const INICIAL: EstadoLlamadas = { activa: null, timbres: [], hosts: 0 };
let estado: EstadoLlamadas = INICIAL;
/** Tarea pesada de la llamada en curso (alimenta el modo «auto» de rendimiento). */
let soltarOcupado: (() => void) | null = null;
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
    // TIM1115B: contestar una llamada corta TODO sonido de timbre del aparato (antes solo se quitaba la tarjeta de esa sesión).
    silenciarTodos("contestada");
    soltarOcupado?.();
    soltarOcupado = marcarOcupado(`llamada:${a.sesionId}`, "llamada");
    cambiar({ activa: a, timbres: estado.timbres.filter((t) => t.sesionId !== a.sesionId) });
}

export function quitarActiva(a?: Pick<LlamadaActiva, "motor">) {
    // Se compara el motor: minimizar crea un objeto nuevo de la misma llamada.
    if (a && estado.activa?.motor !== a.motor) return;
    soltarOcupado?.();
    soltarOcupado = null;
    silenciarTodos("llamada-acabada"); // TIM1115B
    cambiar({ activa: null });
}

export function minimizarLlamada(v: boolean) {
    if (!estado.activa || estado.activa.minimizada === v) return;
    cambiar({ activa: { ...estado.activa, minimizada: v } });
}

/**
 * TIM1115B · Sesiones cuyo «colgar» llegó (o que ya se atendieron): un timbre de esa sesión que llega DESPUÉS (un reenvío
 * tardío) no suena. Solo por sesión: un «colgar» tardío de una llamada vieja nunca toca una más nueva.
 */
const COLGADAS = new Set<string>();
const MAX_COLGADAS = 64;

export function sesionColgada(sesionId: string): boolean {
    return COLGADAS.has(sesionId);
}

/** TIM1115B · Quien llamó colgó: la tarjeta se retira (y su sonido con ella). Devuelve si había timbre. */
export function colgarTimbre(sesionId: string): boolean {
    COLGADAS.add(sesionId);
    if (COLGADAS.size > MAX_COLGADAS) COLGADAS.delete(COLGADAS.values().next().value as string);
    const habia = estado.timbres.some((t) => t.sesionId === sesionId);
    quitarTimbre(sesionId);
    return habia;
}

export function agregarTimbre(t: TimbreEntrante) {
    if (COLGADAS.has(t.sesionId)) return;
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
    COLGADAS.clear();
    soltarOcupado?.();
    soltarOcupado = null;
    estado = INICIAL;
}

/* (LLA1108D) En la app, las llamadas por canal también son llamadas del teléfono (aviso, audio, proximidad).
 * El enlace mira este almacén y el motor de la llamada; en la web normal no hace nada. */
if (typeof window !== "undefined") {
    void import("@/lib/llamadas/nativa/puente-llamada-nativa").then((m) => m.conectarLlamadaNativa()).catch(() => undefined);
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
