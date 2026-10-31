"use client";
/* StarSeed XR · HOOK DE FÍSICA (XR1010W · §3 g). Rapier con `import()` perezoso, paso fijo en `useFrame` y
   poses publicadas. SOLO el anfitrión simula y emite `pose-cuerpos` a 10 Hz; los demás interpolan. Sin Rapier
   el mundo se ve sin física y lo dice: nunca se cae la escena. */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import { crearMundoFisico, leerPoses, liberarMundo, paso, type MundoFisico, type PoseCuerpo } from "./fisica-rapier";
export type EstadoFisica = "cargando" | "lista" | "sin-fisica";
/** Lo mínimo que el hook necesita del canal de escena (`ConexionEscena` encaja sin cambios). */
export interface CanalPoses {
    enviar(evento: string, payload: Record<string, unknown>): void;
    onMensaje?(cb: (evento: string, payload: unknown) => void): () => void;
}
export interface OpcionesFisica {
    mundo: MundoSpec; nivel: NivelCalidad;
    /** La elección de anfitrión es de XR1010AC; aquí solo se obedece. */
    esAnfitrion: boolean; canal?: CanalPoses | null;
}
export interface ResultadoFisica {
    estado: EstadoFisica; poses: Map<string, PoseCuerpo>;
    aviso: string | null; fisica: MutableRefObject<MundoFisico | null>;
}
const HZ_POSES = 10;
const AVISO_SIN_FISICA = "Este mundo se ve sin física: Rapier no cargó en este aparato.";
function aJson(poses: Map<string, PoseCuerpo>): Record<string, PoseCuerpo> {
    const salida: Record<string, PoseCuerpo> = {};
    poses.forEach((p, id) => { salida[id] = p; });
    return salida;
}
function leerRemotas(payload: unknown): Map<string, PoseCuerpo> {
    const salida = new Map<string, PoseCuerpo>();
    if (!payload || typeof payload !== "object") return salida;
    for (const [id, valor] of Object.entries(payload as Record<string, unknown>)) {
        if (!valor || typeof valor !== "object") continue;
        const p = valor as { pos?: unknown; rot?: unknown };
        if (!Array.isArray(p.pos) || p.pos.length < 3 || !Array.isArray(p.rot) || p.rot.length < 4) continue;
        const pos = p.pos.slice(0, 3).map(Number) as Vec3;
        const rot = p.rot.slice(0, 4).map(Number) as [number, number, number, number];
        if (pos.some((n) => !Number.isFinite(n)) || rot.some((n) => !Number.isFinite(n))) continue;
        salida.set(id, { pos, rot });
    }
    return salida;
}
function interpolar(actuales: Map<string, PoseCuerpo>, objetivos: Map<string, PoseCuerpo>, dt: number): Map<string, PoseCuerpo> {
    const salida = new Map<string, PoseCuerpo>();
    const alfa = Math.min(1, Math.max(0, dt * 12));
    objetivos.forEach((objetivo, id) => {
        const actual = actuales.get(id) ?? objetivo, mezcla = (a: number, b: number) => a + (b - a) * alfa;
        salida.set(id, {
            pos: [mezcla(actual.pos[0], objetivo.pos[0]), mezcla(actual.pos[1], objetivo.pos[1]), mezcla(actual.pos[2], objetivo.pos[2])],
            rot: [mezcla(actual.rot[0], objetivo.rot[0]), mezcla(actual.rot[1], objetivo.rot[1]), mezcla(actual.rot[2], objetivo.rot[2]), mezcla(actual.rot[3], objetivo.rot[3])],
        });
    });
    return salida;
}
export function useFisica({ mundo, nivel, esAnfitrion, canal = null }: OpcionesFisica): ResultadoFisica {
    const [estado, setEstado] = useState<EstadoFisica>("cargando");
    const [poses, setPoses] = useState<Map<string, PoseCuerpo>>(() => new Map());
    const fisica = useRef<MundoFisico | null>(null);
    const actuales = useRef<Map<string, PoseCuerpo>>(new Map());
    const remotas = useRef<Map<string, PoseCuerpo>>(new Map());
    const acumulado = useRef(0);
    useEffect(() => {
        let vivo = true;
        setEstado("cargando");
        (async () => {
            try {
                const RAPIER = await import("@dimforge/rapier3d-compat");
                await RAPIER.init();
                if (!vivo) return;
                fisica.current = crearMundoFisico(RAPIER, mundo, nivel);
                setEstado("lista");
            } catch {
                if (!vivo) return;
                fisica.current = null;
                setEstado("sin-fisica");
            }
        })();
        return () => { vivo = false; liberarMundo(fisica.current); fisica.current = null; };
    }, [mundo, nivel]);
    useEffect(() => {
        if (esAnfitrion || !canal?.onMensaje) return;
        return canal.onMensaje((evento, payload) => {
            if (evento === "pose-cuerpos") remotas.current = leerRemotas(payload);
        });
    }, [esAnfitrion, canal]);
    useFrame((_, dt) => {
        const mf = fisica.current;
        if (!mf) return;
        if (esAnfitrion) {
            paso(mf, dt);
            const ahora = leerPoses(mf);
            actuales.current = ahora;
            setPoses(ahora);
            acumulado.current += dt;
            if (acumulado.current >= 1 / HZ_POSES) {
                acumulado.current = 0;
                canal?.enviar("pose-cuerpos", aJson(ahora));
            }
        } else {
            if (!remotas.current.size) return;
            actuales.current = interpolar(actuales.current, remotas.current, dt);
            setPoses(new Map(actuales.current));
        }
    });
    return { estado, poses, aviso: estado === "sin-fisica" ? AVISO_SIN_FISICA : null, fisica };
}
