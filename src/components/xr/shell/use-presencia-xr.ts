/**
 * StarSeed XR · use-presencia-xr.ts
 * Hook de cliente para publicar mi pose (10 Hz) y mantener el estado de otros jugadores en la sala.
 * Delegado de `ConexionEscena` (Supabase/P2P). Privacidad estricta con `evaluarSalida`.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { empaquetarPose, limitarFrecuencia, jugadoresVisibles, elegirAnfitrion } from "@/lib/xr/presencia";
import { evaluarSalida } from "@/lib/xr/privacidad";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { PoseCabeza, PoseManos, MensajePresencia } from "@/lib/xr/presencia";
import type { Vec3 } from "@/lib/xr/tipos";

export interface Conectado {
    id: string;
    desde: number;
}

export function usePresenciaXR(
    userId: string,
    conexion: any, // ConexionEscena (XR1010AA o Supabase)
    destino: "sala-publica" | "sala-grupo" | "nube-terceros"
) {
    const [conectados, setConectados] = useState<Conectado[]>([]);
    const ultimoEnvio = useRef(0);
    const [miPos, setMiPos] = useState<Vec3>([0, 0, 0]);

    const publicar = useCallback((cabeza: PoseCabeza, manos?: PoseManos) => {
        const ahora = Date.now();
        if (!limitarFrecuencia(ultimoEnvio.current, ahora, 10)) return;

        const veredicto = evaluarSalida("pose-avatar", destino, ahora);
        if (!veredicto.permitido) return;

        const mensaje: MensajePresencia = {
            ...empaquetarPose(cabeza, manos),
            timestamp: ahora,
        };

        conexion.emit("pose", mensaje);
        ultimoEnvio.current = ahora;

        // Actualizar posición local para cálculos posteriores
        setMiPos(cabeza.pos);
    }, [conexion, destino]);

    useEffect(() => {
        const sub = conexion.on("sala-cambios", (data: { jugadores: Conectado[] }) => {
            setConectados(data.jugadores);
        });
        return () => sub.off();
    }, [conexion]);

    return {
        publicar,
        conectados,
        esAnfitrion: elegirAnfitrion(conectados) === userId,
        jugadoresVisibles: jugadoresVisibles(
            conectados.map((c) => ({ id: c.id, pos: miPos })),
            miPos,
            PERFILES["media"].jugadoresVisibles
        ),
    };
}
