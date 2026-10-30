"use client";

/** XR1010AC · Presencia XR (§3 h y k): publica `pose-avatar` (sólo cabeza + manos) a 10 Hz como
 *  máximo, pasando antes por `evaluarSalida`; interpola las remotas, elige anfitrión (menor id, con
 *  relevo) y pinta los avatares visibles con `AvatarXR`. XR1010AS lo cablea en `/xr/os`. */
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ConexionEscena } from "@/lib/vivo/espacial/canal";
import { avataresDePresencia, colorDeClave, type MetaAvatar } from "@/lib/vivo/espacial/avatares";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { evaluarSalida, type Consentimiento, type Destino } from "@/lib/xr/privacidad";
import {
    desempaquetarPose, elegirAnfitrion, empaquetarPose, interpolar, jugadoresVisibles, limitarFrecuencia,
    type ConectadoXR, type ManosCrudasXR, type PoseCabezaManosXR, type PoseCrudaXR,
} from "@/lib/xr/presencia";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import { AvatarXR } from "./avatar-xr";
export interface PoseVisorXR { cabeza: PoseCrudaXR; manos?: ManosCrudasXR }
export interface OpcionesPresenciaXR {
    conexion: ConexionEscena | null; miId: string; leerPose: () => PoseVisorXR | null; destino: Destino; nivel: NivelCalidad;
    miPos?: Vec3; hz?: number; consentimientos?: () => Consentimiento[]; ahora?: () => number;
    programar?: (fn: () => void, ms: number) => unknown; cancelar?: (id: unknown) => void;
}
export interface VisibleRemotoXR { id: string; meta: MetaAvatar; pose: PoseCabezaManosXR; jugadoresVisibles: number }
export interface PresenciaXR {
    esAnfitrion: boolean; anfitrion: string | null; conectados: ConectadoXR[]; visibles: VisibleRemotoXR[];
    elementos: ReactNode[]; leerRemotos: (t?: number) => Map<string, PoseCabezaManosXR>; aviso: string | null;
}
type Remoto = { anterior: PoseCabezaManosXR; actual: PoseCabezaManosXR; recibida: number };
const ahoraSistema = () => Date.now();
const programarSistema = (fn: () => void, ms: number) => setTimeout(fn, ms);
const cancelarSistema = (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>);
const metaDesconocida = (id: string): MetaAvatar => ({
    clave: id, uid: null, nombre: "Persona", color: colorDeClave(id), modo: "3d", editor: false, desde: 0,
});
export function usePresenciaXR(o: OpcionesPresenciaXR): PresenciaXR {
    const { conexion, miId, nivel, miPos } = o;
    const hz = o.hz ?? 10;
    const pasoMs = Math.max(16, Math.min(50, Math.round(1000 / Math.max(1, hz))));
    const { ahora = ahoraSistema, programar = programarSistema, cancelar = cancelarSistema } = o;
    const [metas, setMetas] = useState<MetaAvatar[]>([]);
    const [pulso, setPulso] = useState(0);
    const [aviso, setAviso] = useState<string | null>(null);
    const remotos = useRef(new Map<string, Remoto>());
    const miPosRef = useRef<Vec3 | null>(miPos ?? null);
    const ultimoEnvio = useRef(Number.NEGATIVE_INFINITY);
    useEffect(() => {
        if (!conexion) return;
        let vivo = true;
        const mapa = remotos.current;
        mapa.clear();
        const offMensaje = conexion.onMensaje((evento, payload) => {
            if (evento !== "pose") return;
            const p = payload as Record<string, unknown> | null;
            const de = typeof p?.de === "string" ? p.de : "";
            if (!de || de === miId) return;
            const pose = desempaquetarPose(p);
            if (!pose) return;
            const previa = mapa.get(de);
            mapa.set(de, { anterior: previa ? previa.actual : pose, actual: pose, recibida: ahora() });
        });
        const offPresencia = conexion.onPresencia((estado) => setMetas(avataresDePresencia(estado, miId)));
        let timer: unknown = null;
        const paso = () => {
            if (!vivo) return;
            const t = ahora();
            const p = o.leerPose();
            if (p) {
                miPosRef.current = p.cabeza.pos;
                if (limitarFrecuencia(ultimoEnvio.current, t, hz)) {
                    const ver = evaluarSalida("pose-avatar", o.destino, t, o.consentimientos?.() ?? []);
                    if (ver.permitido) {
                        conexion.enviar("pose", { de: miId, ...empaquetarPose(p.cabeza, p.manos) });
                        ultimoEnvio.current = t;
                    } else setAviso(ver.motivo);
                }
            }
            if (mapa.size > 0) setPulso((n) => (n + 1) % 1_000_000);
            timer = programar(paso, pasoMs);
        };
        timer = programar(paso, pasoMs);
        return () => { vivo = false; if (timer !== null) cancelar(timer); offMensaje(); offPresencia(); };
        // El reloj y la pose se leen de `o`; si cambian de identidad, se reabre la escucha.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conexion, miId, hz, pasoMs, ahora, programar, cancelar]);

    const leerRemotos = useCallback((t = ahora()) => {
        const salida = new Map<string, PoseCabezaManosXR>();
        const intervalo = 1000 / Math.max(1, hz);
        for (const [id, r] of remotos.current) {
            salida.set(id, interpolar(r.anterior, r.actual, Math.min(1, Math.max(0, (t - r.recibida) / intervalo))));
        }
        return salida;
    }, [ahora, hz]);

    const visibles = useMemo(() => {
        const mapa = leerRemotos();
        const orden = jugadoresVisibles(
            Array.from(mapa, ([id, pose]) => ({ id, pos: pose.cabeza.p })), miPos ?? miPosRef.current ?? [0, 0, 0],
            PERFILES[nivel].jugadoresVisibles,
        );
        const porId = new Map(metas.map((m) => [m.clave, m]));
        return orden.flatMap((j, i) => {
            const pose = mapa.get(j.id);
            return pose ? [{ id: j.id, meta: porId.get(j.id) ?? metaDesconocida(j.id), pose, jugadoresVisibles: i }] : [];
        });
        // `pulso` recalcula en cada pose; `leerRemotos` interpola con el reloj.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leerRemotos, metas, nivel, miPos, pulso]);

    const elementos = useMemo(() => visibles.map((v) => createElement(AvatarXR, {
        key: v.id, pose: v.pose, nivel, preferencia: null, color: v.meta.color, jugadoresVisibles: v.jugadoresVisibles,
    })), [visibles, nivel]);
    const conectados: ConectadoXR[] = [miId, ...Array.from(remotos.current.keys()).filter((id) => id !== miId)]
        .map((id) => ({ id, desde: 0 }));
    const anfitrion = elegirAnfitrion(conectados);
    return {
        esAnfitrion: anfitrion === null || anfitrion.id === miId, anfitrion: anfitrion?.id ?? null,
        conectados, visibles, elementos, leerRemotos, aviso,
    };
}
