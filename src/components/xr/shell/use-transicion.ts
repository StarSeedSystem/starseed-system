/**
 * StarSeed XR · TRANSICIONES EN EL VISOR (XR1010I · contrato §3 b).
 * Parte pura (crearAnimacion/muestra) + hook R3F que muta el Object3D y sus materiales por ref:
 * cero setState por fotograma. El estilo sale del perfil de calidad, el movimiento reducido solo
 * desvanece y la distancia escala el desplazamiento. La aritmética vive en `src/lib/xr/transiciones.ts`.
 */
"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { Material, Object3D } from "three";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import { acotar, type NivelCalidad } from "../../../lib/xr/tipos";
import {
    evaluar, planTransicion, retardoDeHermano,
    type EstadoVisual, type EstiloTransicion, type EventoTransicion, type PlanTransicion,
} from "../../../lib/xr/transiciones";
import { usePrefsXR } from "./use-prefs-xr";

export interface Animacion { plan: PlanTransicion; t0: number }
export interface OpcionesAnimacion { hermano?: { i: number; n: number }; desde?: EstadoVisual }
export interface OpcionesTransicion {
    estilo?: EstiloTransicion;
    nivel?: NivelCalidad;
    hermano?: { i: number; n: number };
    movimientoReducido?: boolean;
    /** Distancia del panel en metros (por defecto 1,8). */
    distancia?: number;
    alTerminar?: () => void;
}
export interface ResultadoTransicion<T extends Object3D> {
    grupo: RefObject<T | null>;
    material: RefObject<Material | null>;
    estado: () => EstadoVisual;
}

/** Paneles más cerca se mueven menos: distancia / 1,8 m, acotada a [0,25; 1]. */
export const escalaDistancia = (d: number): number => (Number.isFinite(d) ? acotar(d / 1.8, 0.25, 1) : 1);
/** El estilo que fija el nivel de calidad del aparato. */
export const estiloDeNivel = (nivel: NivelCalidad): EstiloTransicion => PERFILES[nivel].transiciones;

/** Resuelve el retardo del hermano dentro del plan y arranca en `t0` (ms del reloj). */
export function crearAnimacion(plan: PlanTransicion, t0: number, o: OpcionesAnimacion = {}): Animacion {
    const hermano = o.hermano ? retardoDeHermano(plan, o.hermano.i, o.hermano.n) : 0;
    return { plan: { ...plan, retardo: plan.retardo + hermano, desde: o.desde ?? plan.desde }, t0 };
}

/** Estado visual en `ahora` y si la animación ya terminó (el retardo del hermano se descuenta). */
export function muestra(a: Animacion, ahora: number): { estado: EstadoVisual; terminada: boolean } {
    const t = ahora - a.t0;
    return { estado: t < a.plan.retardo ? a.plan.desde : evaluar(a.plan, t), terminada: t >= a.plan.retardo + a.plan.ms };
}

interface BaseMaterial { opacidad: number; transparente: boolean; brillo: number | null }

const BASES = new WeakMap<Material, BaseMaterial>();
const REPOSO: EstadoVisual = { pos: [0, 0, 0], esc: 1, opacidad: 1, brillo: 0 };

function aplicarMaterial(m: Material, e: EstadoVisual): void {
    let b = BASES.get(m);
    if (!b) {
        const intenso = (m as unknown as { emissiveIntensity?: number }).emissiveIntensity;
        b = { opacidad: m.opacity, transparente: m.transparent, brillo: typeof intenso === "number" ? intenso : null };
        BASES.set(m, b);
    }
    m.opacity = b.opacidad * e.opacidad;
    const transparente = e.opacidad < 0.999 || b.transparente;
    if (m.transparent !== transparente) { m.transparent = transparente; m.needsUpdate = true; }
    if (b.brillo !== null) (m as unknown as { emissiveIntensity: number }).emissiveIntensity = b.brillo + e.brillo;
}

function materialesDe(objeto: Object3D): Material[] {
    const salida: Material[] = [];
    objeto.traverse((hijo) => {
        const m = (hijo as unknown as { material?: Material | Material[] }).material;
        for (const x of Array.isArray(m) ? m : m ? [m] : []) if ("opacity" in x) salida.push(x);
    });
    return salida;
}

function aplicar(objeto: Object3D | null, material: Material | null, e: EstadoVisual): void {
    if (objeto) {
        objeto.position.set(e.pos[0], e.pos[1], e.pos[2]);
        objeto.scale.setScalar(e.esc);
        for (const m of materialesDe(objeto)) aplicarMaterial(m, e);
    }
    if (material) aplicarMaterial(material, e);
}

export function useTransicion<T extends Object3D = Object3D>(evento: EventoTransicion, o: OpcionesTransicion = {}): ResultadoTransicion<T> {
    const { confort } = usePrefsXR();
    const grupo = useRef<T | null>(null), material = useRef<Material | null>(null), anim = useRef<Animacion | null>(null), valor = useRef<EstadoVisual | null>(null);
    const pendiente = useRef(true), hecho = useRef(false), avisado = useRef(false), primera = useRef(true);
    const terminar = useRef(o.alTerminar); terminar.current = o.alTerminar;
    const reducido = o.movimientoReducido ?? confort.movimientoReducido;
    const estilo = o.estilo ?? estiloDeNivel(o.nivel ?? "media"), distancia = o.distancia ?? 1.8;
    const i = o.hermano?.i ?? 0, n = o.hermano?.n ?? 1;
    useEffect(() => {
        if (primera.current) return void (primera.current = false);
        pendiente.current = true; hecho.current = false; avisado.current = false;
    }, [evento, estilo, reducido, distancia, i, n]);
    useFrame(({ clock }) => {
        if (hecho.current && !pendiente.current) return;
        const ahora = clock.elapsedTime * 1000;
        if (!anim.current || pendiente.current) {
            const plan = planTransicion(evento, estilo, { movimientoReducido: reducido, escalaDistancia: escalaDistancia(distancia) });
            const actual = valor.current;
            const desde = actual && reducido ? { ...actual, pos: [0, 0, 0] as [number, number, number], esc: 1 } : actual ?? undefined;
            anim.current = crearAnimacion(plan, ahora, { hermano: o.hermano, desde });
            pendiente.current = false; avisado.current = false;
        }
        const { estado, terminada } = muestra(anim.current, ahora);
        valor.current = estado; aplicar(grupo.current, material.current, estado);
        if (terminada) { hecho.current = true; if (!avisado.current) { avisado.current = true; terminar.current?.(); } }
    });
    return { grupo, material, estado: () => valor.current ?? REPOSO };
}
