"use client";
/**
 * StarSeed XR · MOVIMIENTO DE INTERFAZ (XR1010I · contrato `architecture/starseed-xr.md` §3 b).
 * `muestra` es puro (evaluar descontando el retardo); `useTransicion` muta el `Object3D` y sus
 * materiales dentro de `useFrame`, sin re-render por fotograma.
 */
import { useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Material, Object3D } from "three";
import { acotar } from "../../../lib/xr/tipos";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { usePrefsXR } from "./use-prefs-xr";
import {
    evaluar, planTransicion, retardoDeHermano,
    type EstadoVisual, type EstiloTransicion, type EventoTransicion, type PlanTransicion,
} from "../../../lib/xr/transiciones";

export interface Animacion { plan: PlanTransicion; t0: number; retardo: number }
export interface MuestraAnimacion { estado: EstadoVisual; terminada: boolean }
export interface HermanoTransicion { i: number; n: number }
export interface OpcionesTransicion {
    /** Si no se indica, sale de `PERFILES[nivel].transiciones`. */
    estilo?: EstiloTransicion;
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

export const crearAnimacion = (plan: PlanTransicion, t0: number, retardo = 0): Animacion =>
    ({ plan, t0, retardo: Math.max(0, retardo) });

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
            esc: actual.esc, opacidad: actual.opacidad, brillo: actual.brillo,
        },
    };
}

/** Paneles más cerca se mueven menos: distancia / 1,8 acotada a [0,25; 1]. */
export function escalaPorDistancia(distancia?: number): number {
    return typeof distancia === "number" && Number.isFinite(distancia) ? acotar(distancia / 1.8, 0.25, 1) : 1;
}

/** Aplica el estado visual al objeto y a sus materiales MUTÁNDOLOS (nada nuevo por fotograma). */
export function aplicarEstado(objeto: Object3D, estado: EstadoVisual): void {
    objeto.position.set(estado.pos[0], estado.pos[1], estado.pos[2]);
    objeto.scale.setScalar(estado.esc);
    const transparente = estado.opacidad < 1;
    objeto.traverse((hijo) => {
        const material = (hijo as { material?: Material | Material[] }).material;
        const lista = Array.isArray(material) ? material : material ? [material] : [];
        for (const m of lista) {
            m.opacity = estado.opacidad;
            if (m.transparent !== transparente) { m.transparent = transparente; m.needsUpdate = true; }
            const conBrillo = m as Material & { emissiveIntensity?: number };
            if (typeof conBrillo.emissiveIntensity === "number") conBrillo.emissiveIntensity = estado.brillo;
        }
    });
}

export function useTransicion<T extends Object3D = Object3D>(
    evento: EventoTransicion,
    opciones: OpcionesTransicion = {},
): ControlTransicion<T> {
    const ref = useRef<T | null>(null);
    const { calidad, confort } = usePrefsXR();
    const nivel = calidad.modo === "auto" ? "media" : calidad.modo;
    const estilo = opciones.estilo ?? PERFILES[nivel].transiciones;
    const movimientoReducido = opciones.movimientoReducido ?? confort.movimientoReducido;
    const { hermano, distancia, alTerminar } = opciones;
    const anim = useRef<Animacion | null>(null);
    const actual = useRef<EstadoVisual | null>(null);
    const previo = useRef<EventoTransicion | null>(null);
    const termino = useRef(false);
    const [terminada, setTerminada] = useState(false);

    useFrame((marco) => {
        const objeto = ref.current;
        if (!objeto) return;
        const ahora = marco.clock.elapsedTime * 1000;
        if (!anim.current || previo.current !== evento) {
            const base = planTransicion(evento, estilo, {
                movimientoReducido, escalaDistancia: escalaPorDistancia(distancia),
            });
            const plan = previo.current !== null && actual.current ? partirDe(base, actual.current) : base;
            const retardo = hermano ? retardoDeHermano(plan, hermano.i, hermano.n) : 0;
            anim.current = crearAnimacion(plan, ahora, retardo);
            previo.current = evento;
            termino.current = false;
            setTerminada(false);
        }
        const { estado, terminada: fin } = muestra(anim.current, ahora);
        actual.current = estado;
        aplicarEstado(objeto, estado);
        if (fin && !termino.current) {
            termino.current = true;
            setTerminada(true);
            alTerminar?.();
        }
    });
    return { ref, terminada };
}
