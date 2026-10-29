/**
 * StarSeed XR · FÍSICA EN LA ESCENA (XR1010W · contrato §3 g). Hook R3F: carga Rapier con `import()`
 * perezoso, corre el paso fijo en `useFrame` y publica las poses de los cuerpos dinámicos. SOLO la
 * neurona anfitriona simula y manda `pose-cuerpos` a 10 Hz por el canal; los demás interpolan lo
 * recibido, nunca simulan. Si Rapier no carga, el mundo se ve sin física y se lo dice: no falla.
 */
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { MundoSpec } from "../../../lib/xr/mundo-tipos";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import { crearMundoFisico, type EventoChoque, type MundoFisico, type PoseCuerpo } from "./fisica-rapier";

export interface CanalFisica {
    enviar(evento: string, payload: Record<string, unknown>): void;
    onMensaje(cb: (evento: string, payload: unknown) => void): () => void;
}
export type EstadoFisica = "cargando" | "lista" | "sin-fisica";
export const EVENTO_POSES = "pose-cuerpos";
const HZ_PUBLICACION = 10;

export type PoseEnRed = [number, number, number, number, number, number, number];
export type PosesRecibidas = Record<string, PoseEnRed>;

export function codificarPoses(poses: Map<string, PoseCuerpo>): PosesRecibidas {
    const fuera: PosesRecibidas = {};
    poses.forEach((p, id) => { fuera[id] = [...p.pos, ...p.rot] as PoseEnRed; });
    return fuera;
}

/** Lo que llega por el canal (datos de terceros: se sanea número a número; nada «se fía»). */
export function decodificarPoses(bruto: unknown): PosesRecibidas {
    const fuera: PosesRecibidas = {};
    if (typeof bruto !== "object" || bruto === null) return fuera;
    for (const [id, v] of Object.entries(bruto as Record<string, unknown>)) {
        if (Array.isArray(v) && v.length === 7 && v.every((n) => typeof n === "number" && Number.isFinite(n))) fuera[id] = v as PoseEnRed;
    }
    return fuera;
}

/** Los NO anfitriones no simulan: acercan cada pose a la que el anfitrión difundió (factor 0–1). */
export function interpolarPoses(actuales: PosesRecibidas, recibidas: PosesRecibidas, factor: number): PosesRecibidas {
    const f = Math.min(1, Math.max(0, factor));
    const fuera: PosesRecibidas = {};
    for (const [id, objetivo] of Object.entries(recibidas)) {
        const a = actuales[id];
        fuera[id] = (a ? a.map((n, i) => n + (objetivo[i] - n) * f) : [...objetivo]) as PoseEnRed;
    }
    return fuera;
}

export interface OpcionesFisica { esAnfitrion?: boolean; canal?: CanalFisica | null }
export interface ResultadoFisica {
    estado: EstadoFisica;
    /** Poses por id, de los cuerpos dinámicos: las leen las mallas en su propio useFrame, por REF. */
    poses: RefObject<PosesRecibidas>;
    choques: RefObject<EventoChoque[]>;
    recortados: number;
}

export function useFisica(mundo: MundoSpec | null, nivel: NivelCalidad, opciones: OpcionesFisica = {}): ResultadoFisica {
    const [estado, fijarEstado] = useState<EstadoFisica>("cargando");
    const [recortados, fijarRecortados] = useState(0);
    const refSimulacro = useRef<MundoFisico | null>(null);
    const refPoses = useRef<PosesRecibidas>({});
    const refRecibidas = useRef<PosesRecibidas>({});
    const refChoques = useRef<EventoChoque[]>([]);
    const refUltimaPublicacion = useRef(0);
    const refAnfitrion = useRef(opciones.esAnfitrion === true);
    const refCanal = useRef(opciones.canal ?? null);
    refAnfitrion.current = opciones.esAnfitrion === true;
    refCanal.current = opciones.canal ?? null;

    useEffect(() => {
        if (!mundo) return;
        let viva = true;
        fijarEstado("cargando");
        import("@dimforge/rapier3d-compat")
            .then(async (motor) => { await motor.init(); return crearMundoFisico(motor, mundo, nivel); })
            .then((m) => { if (viva) { refSimulacro.current = m; fijarRecortados(m.recortados); fijarEstado("lista"); } else m.terminar(); })
            .catch(() => { if (viva) fijarEstado("sin-fisica"); });
        return () => { viva = false; refSimulacro.current?.terminar(); refSimulacro.current = null; };
    }, [mundo, nivel]);

    useEffect(() => {
        if (refAnfitrion.current || !refCanal.current) return;
        return refCanal.current.onMensaje((evento, carga) => {
            if (evento === EVENTO_POSES) refRecibidas.current = decodificarPoses((carga as { poses?: unknown })?.poses);
        });
    }, []);

    useFrame((_, dt) => {
        const simulacro = refSimulacro.current;
        if (!simulacro) return;
        const paso = Math.min(dt, 0.25);
        if (refAnfitrion.current) {
            simulacro.paso(paso);
            refPoses.current = codificarPoses(simulacro.leerPoses());
            const choques = simulacro.extraerChoques();
            if (choques.length) refChoques.current = choques;
            const ahora = performance.now();
            if (refCanal.current && ahora - refUltimaPublicacion.current >= 1000 / HZ_PUBLICACION) {
                refUltimaPublicacion.current = ahora;
                refCanal.current.enviar(EVENTO_POSES, { poses: refPoses.current });
            }
        } else {
            refPoses.current = interpolarPoses(refPoses.current, refRecibidas.current, paso * 8);
        }
    });

    return { estado, poses: refPoses, choques: refChoques, recortados };
}
