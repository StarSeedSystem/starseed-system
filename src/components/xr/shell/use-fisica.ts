"use client";
/**
 * StarSeed XR · FÍSICA EN VIVO (contrato §3 g). Motor cliente: carga Rapier con `import()`
 * perezoso y corre `paso` en cada fotograma (`useFrame`). La simulación es del ANFITRIÓN
 * (`esAnfitrion` llega por prop; la elección la hace XR1010AC con el menor id conectado):
 * el anfitrión publica `pose-cuerpos` a 10 Hz por el canal; los demás SUSCRIBEN y pintan
 * las poses recibidas (con `interpolarPose`), sin simular. Si Rapier no carga, el mundo se
 * ve SIN física y se avisa («sin-fisica»): nunca tumba la escena.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { crearMundoFisico, leerPoses, paso, type MundoFisico, type PosesCuerpos, type Rapier } from "./fisica-rapier";

export interface CanalFisica {
    enviar(evento: string, payload: Record<string, unknown>): void;
    onMensaje(cb: (evento: string, payload: unknown) => void): () => void;
}

export type EstadoFisica = "cargando" | "lista" | "sin-fisica";

const MS_PUBLICACION = 100; // 10 Hz, el mismo ritmo que las poses de avatares

/** El anfitrión manda poco y grueso: publica cada 100 ms como mucho. */
export function tocaPublicar(ultima: number, ahora: number): boolean {
    if (ultima === 0) return true;
    return ahora - ultima >= MS_PUBLICACION;
}

export interface PoseCuerpo {
    pos: [number, number, number];
    rot: [number, number, number, number];
}

/** Interpolación lineal de dos poses (la rotación, nlerp: suficiente a 10 Hz). */
export function interpolarPose(a: PoseCuerpo, b: PoseCuerpo, t: number): PoseCuerpo {
    const f = Math.min(1, Math.max(0, t));
    const mix = (p: readonly number[], q: readonly number[]): number[] => p.map((v, i) => v + (q[i] - v) * f);
    return { pos: mix(a.pos, b.pos) as [number, number, number], rot: mix(a.rot, b.rot) as [number, number, number, number] };
}

/** Poses que llegan por el canal (`pose-cuerpos`): saneadas, sin confiar ni un pelo del remitente. */
export function posesDeMensaje(payload: unknown): PosesCuerpos | null {
    if (!payload || typeof payload !== "object") return null;
    const crudo = (payload as { poses?: Record<string, unknown> }).poses;
    if (!crudo || typeof crudo !== "object") return null;
    const poses: PosesCuerpos = new Map();
    for (const [id, valor] of Object.entries(crudo)) {
        const pose = valor as Partial<PoseCuerpo> | null;
        if (!pose || !validos(pose.pos, 3, 1) || !validos(pose.rot, 4, -1)) continue;
        poses.set(id, { pos: pose.pos as PoseCuerpo["pos"], rot: pose.rot as PoseCuerpo["rot"] });
    }
    return poses;
}

function validos(v: unknown, largo: number, min: number): v is number[] {
    return Array.isArray(v) && v.length === largo && v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= min);
}

export interface PropsFisica {
    mundo: MundoSpec;
    nivel: NivelCalidad;
    esAnfitrion: boolean;
    canal: CanalFisica | null;
    poses: RefObject<PosesCuerpos | undefined>;
    alEstado?: (estado: EstadoFisica) => void;
}

export function FisicaRapier({ mundo, nivel, esAnfitrion, canal, poses, alEstado }: PropsFisica): null {
    const [ra, setRa] = useState<Rapier | null>(null);
    const avisa = useRef(alEstado);
    avisa.current = alEstado;

    // Carga perezosa del motor (el layout raíz NUNCA la trae; sólo vive bajo la ruta /xr/os).
    useEffect(() => {
        let viva = true;
        avisa.current?.("cargando");
        import("@dimforge/rapier3d-compat")
            .then(async (m) => {
                await m.init();
                if (viva) { setRa(m.default ?? m); avisa.current?.("lista"); }
            })
            .catch(() => {
                if (viva) { setRa(null); avisa.current?.("sin-fisica"); } // mundo sin física, no error
            });
        return () => { viva = false; };
    }, []);

    const wf = useMemo<MundoFisico | null>(() => (ra ? crearMundoFisico(ra, mundo, nivel) : null), [ra, mundo, nivel]);
    useEffect(() => () => wf?.mundo.free(), [wf]);

    // Sin ser anfitrión: interpolar lo que el anfitrión publica, no simular.
    useEffect(() => {
        if (esAnfitrion || !canal) return;
        return canal.onMensaje((evento, payload) => {
            if (evento !== "pose-cuerpos") return;
            const recibidas = posesDeMensaje(payload);
            if (recibidas) poses.current = recibidas;
        });
    }, [esAnfitrion, canal, poses]);

    const ultima = useRef(0);
    useFrame((_, dt) => {
        if (!wf) return;
        paso(wf, dt);
        if (!esAnfitrion) return;
        poses.current = leerPoses(wf);
        const ahora = performance.now();
        if (canal && tocaPublicar(ultima.current, ahora)) {
            ultima.current = ahora;
            canal.enviar("pose-cuerpos", { t: Math.round(ahora), poses: Object.fromEntries(poses.current) });
        }
    });
    return null;
}
