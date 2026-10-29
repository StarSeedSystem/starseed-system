"use client";

/**
 * StarSeed XR · HOOK DE FÍSICA (§3 g): carga rapier con `import()` perezoso, corre `paso` en
 * `useFrame` y publica las poses de los dinámicos al render. SÓLO el anfitrión (lo elige
 * XR1010AC) simula y emite `pose-cuerpos` a 10 Hz por el canal; los demás interpolan lo
 * recibido. Si rapier no carga, el mundo se ve sin física y lo dice; nunca lanza.
 */
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import { crearMundoFisico, leerPoses, paso, type Cuaternion, type MundoFisico, type PoseCuerpo } from "./fisica-rapier";
export const HZ_POSES = 10;
export interface CanalPoses {
    enviar(evento: "pose-cuerpos", payload: Record<string, unknown>): void;
    onMensaje?(cb: (evento: string, payload: unknown) => void): () => void;
}
export interface OpcionesFisica {
    mundo: MundoSpec; nivel: NivelCalidad; esAnfitrion: boolean;
    canal?: CanalPoses | null; onFallo?: (motivo: string) => void;
}
export interface EstadoFisica {
    poses: Map<string, PoseCuerpo>;
    refPoses: { current: Map<string, PoseCuerpo> };
    refMundo: { current: MundoFisico | null };
    listo: boolean; error: string | null;
}
const esVec3 = (v: unknown): v is Vec3 =>
    Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const esCuaternion = (v: unknown): v is Cuaternion =>
    Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));
/** Lee `{ poses: [{ id, pos, rot }] }` del canal y descarta lo que no tenga la forma exacta. */
export function posesDeMensaje(payload: unknown): Map<string, PoseCuerpo> {
    const salida = new Map<string, PoseCuerpo>();
    if (payload === null || typeof payload !== "object") return salida;
    const lista = (payload as { poses?: unknown }).poses;
    if (!Array.isArray(lista)) return salida;
    for (const item of lista) {
        if (item === null || typeof item !== "object") continue;
        const { id, pos, rot } = item as { id?: unknown; pos?: unknown; rot?: unknown };
        if (typeof id === "string" && esVec3(pos) && esCuaternion(rot)) salida.set(id, { pos, rot });
    }
    return salida;
}
/** Interpola posición y cuaternión (lineal normalizado) de `actual` hacia `objetivo`. */
export function interpolarPoses(actual: Map<string, PoseCuerpo>, objetivo: Map<string, PoseCuerpo>, t: number): Map<string, PoseCuerpo> {
    const k = Math.min(1, Math.max(0, t));
    const salida = new Map<string, PoseCuerpo>();
    for (const [id, b] of objetivo) {
        const a = actual.get(id);
        if (!a) { salida.set(id, b); continue; }
        const pos = a.pos.map((v, i) => v + (b.pos[i] - v) * k) as Vec3;
        const q = a.rot.map((v, i) => v + (b.rot[i] - v) * k);
        const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        salida.set(id, { pos, rot: [q[0] / n, q[1] / n, q[2] / n, q[3] / n] });
    }
    return salida;
}
export function useFisica(opciones: OpcionesFisica): EstadoFisica {
    const { mundo, nivel, esAnfitrion, canal = null } = opciones;
    const refMundo = useRef<MundoFisico | null>(null);
    const refPoses = useRef<Map<string, PoseCuerpo>>(new Map());
    const refObjetivo = useRef<Map<string, PoseCuerpo>>(new Map());
    const refFallo = useRef(opciones.onFallo);
    const publicar = useRef(0);
    const [poses, setPoses] = useState<Map<string, PoseCuerpo>>(new Map());
    const [listo, setListo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    refFallo.current = opciones.onFallo;
    useEffect(() => {
        let vivo = true;
        setListo(false); setError(null);
        void (async () => {
            try {
                const R = await import("@dimforge/rapier3d-compat");
                await R.init();
                if (!vivo) return;
                refMundo.current = crearMundoFisico(R, mundo, nivel);
                refPoses.current = leerPoses(refMundo.current);
                setPoses(refPoses.current); setListo(true);
            } catch {
                if (!vivo) return;
                const motivo = "No se pudo cargar Rapier: el mundo se ve sin física.";
                setError(motivo); refFallo.current?.(motivo);
            }
        })();
        return () => {
            vivo = false;
            const mf = refMundo.current;
            if (mf) { mf.eventos.free(); mf.mundo.free(); refMundo.current = null; }
        };
    }, [mundo, nivel]);
    useEffect(() => {
        if (esAnfitrion || !canal?.onMensaje) return;
        return canal.onMensaje((evento, payload) => {
            if (evento === "pose-cuerpos") refObjetivo.current = posesDeMensaje(payload);
        });
    }, [canal, esAnfitrion]);
    useFrame((_, dt) => {
        const mf = refMundo.current;
        if (!mf) return;
        if (esAnfitrion) {
            paso(mf, dt);
            refPoses.current = leerPoses(mf);
        } else if (refObjetivo.current.size > 0) {
            refPoses.current = interpolarPoses(refPoses.current, refObjetivo.current, dt * HZ_POSES);
        }
        publicar.current += dt;
        if (publicar.current < 1 / HZ_POSES) return;
        publicar.current = 0;
        setPoses(new Map(refPoses.current));
        if (esAnfitrion && canal) {
            const lista = [...refPoses.current].map(([id, p]) => ({ id, pos: p.pos, rot: p.rot }));
            canal.enviar("pose-cuerpos", { poses: lista });
        }
    });

    return { poses, refPoses, refMundo, listo, error };
}
