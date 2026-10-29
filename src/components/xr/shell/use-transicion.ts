"use client";
/**
 * StarSeed XR · MOVIMIENTO DE INTERFAZ (XR1010I · contrato `architecture/starseed-xr.md` §3 b).
 *
 * Parte PURA: `crearAnimacion` fija el origen y el retardo del hermano; `muestra` devuelve el
 * estado visual en un instante y si ya terminó. El hook `useTransicion` aplica ese estado a un
 * `Object3D` y a sus materiales MUTÁNDOLOS dentro de `useFrame`: cero re-render por fotograma.
 * El estilo sale del perfil de calidad (`PERFILES[nivel].transiciones`) y el movimiento reducido
 * de `usePrefsXR`; las reglas de confort viven en `src/lib/xr/transiciones.ts`.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Material, Object3D } from "three";
import { acotar } from "../../../lib/xr/tipos";
import {
    evaluar,
    planTransicion,
    retardoDeHermano,
    type EstadoVisual,
    type EstiloTransicion,
    type EventoTransicion,
    type PlanTransicion,
} from "../../../lib/xr/transiciones";

export interface Animacion {
    plan: PlanTransicion;
    t0: number;
    retardo: number;
}

export interface MuestraAnimacion {
    estado: EstadoVisual;
    terminada: boolean;
}

export interface HermanoTransicion {
    i: number;
    n: number;
}

export interface OpcionesTransicion {
    estilo: EstiloTransicion;
    hermano?: HermanoTransicion;
    movimientoReducido?: boolean;
    /** Distancia de la persona al panel, en metros. */
    distancia?: number;
    alTerminar?: () => void;
}

export interface ControlTransicion<T extends Object3D = Object3D> {
    ref: RefObject<T | null>;
    terminada: boolean;
}

export function crearAnimacion(plan: PlanTransicion, t0: number, retardo = 0): Animacion {
    return { plan, t0, retardo: Math.max(0, retardo) };
}

/** Estado en `ahora`: el retardo del hermano se descuenta antes de llamar a `evaluar`. */
export function muestra(anim: Animacion, ahora: number): MuestraAnimacion {
    const transcurrido = ahora - anim.t0;
    return {
        estado: evaluar(anim.plan, transcurrido - anim.retardo),
        terminada: transcurrido >= anim.retardo + anim.plan.ms,
    };
}

/** Una animación nueva (foco, desfoco, salida) parte de lo que se ve ahora, sin saltar. */
export function partirDe(plan: PlanTransicion, actual: EstadoVisual): PlanTransicion {
    return {
        ...plan,
        desde: {
            pos: [actual.pos[0], actual.pos[1], actual.pos[2]],
            esc: actual.esc,
            opacidad: actual.opacidad,
            brillo: actual.brillo,
        },
    };
}

/** Paneles más cerca se mueven menos: distancia / 1,8 acotada a [0,25; 1]. */
export function escalaPorDistancia(distancia?: number): number {
    if (typeof distancia !== "number" || !Number.isFinite(distancia)) return 1;
    return acotar(distancia / 1.8, 0.25, 1);
}

export function useTransicion<T extends Object3D = Object3D>(
    _evento: EventoTransicion,
    _opciones: OpcionesTransicion,
): ControlTransicion<T> {
    throw new Error("pendiente");
}
