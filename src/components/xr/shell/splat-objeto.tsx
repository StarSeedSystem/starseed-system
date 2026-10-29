"use client";

/**
 * StarSeed XR · OBJETO SPLAT (XR1010AM · contrato `architecture/starseed-xr.md` §3 g).
 *
 * Cascarón fino de R3F: toda la lógica (nivel, URL, tamaño, motivos) está en `cargar-splat.ts`
 * y se prueba en node. Aquí solo se pide la malla a Spark —que se importa perezosamente allí—,
 * se le pasan posición, rotación y escala del objeto del mundo, y si falla se pinta el marcador
 * con el motivo. Sin WebGL no se puede comprobar; solo tsc y vitest.
 */
import { useEffect, useState } from "react";
import type { Object3D } from "three";
import { Html } from "@react-three/drei";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import type { ObjetoMundo } from "../../../lib/xr/mundo-tipos";
import {
    MOTIVO_NIVEL_SPLAT,
    MOTIVO_SIN_URL_SPLAT,
    cargarSplat,
    puedeUsarSplat,
    urlSplatDeObjeto,
    type MallaSplat,
} from "./cargar-splat";

export interface PropsSplatObjeto {
    objeto: ObjetoMundo;
    nivel: NivelCalidad;
    /** URL ya resuelta por quien arma el mundo; si falta se lee del objeto de Biblioteca. */
    url?: string;
}

/** Marcador honesto: se pinta cuando el nivel no llega o la carga falla, con su motivo. */
export function MarcadorSplat({ objeto, motivo }: { objeto: ObjetoMundo; motivo: string }) {
    return (
        <group position={objeto.pos} rotation={objeto.rot} scale={objeto.esc}>
            <mesh>
                <boxGeometry args={[0.6, 0.6, 0.6]} />
                <meshBasicMaterial color={objeto.color} wireframe transparent opacity={0.45} />
            </mesh>
            <Html center distanceFactor={4}>
                <div className="max-w-48 rounded-lg bg-black/70 px-3 py-2 text-center text-xs text-white">
                    {motivo}
                </div>
            </Html>
        </group>
    );
}

export function SplatObjeto({ objeto, nivel, url }: PropsSplatObjeto) {
    const [malla, setMalla] = useState<MallaSplat | null>(null);
    const [motivo, setMotivo] = useState<string | null>(
        puedeUsarSplat(nivel) ? null : MOTIVO_NIVEL_SPLAT,
    );
    const direccion = url ?? urlSplatDeObjeto(objeto);

    useEffect(() => {
        let vigente = true;
        setMalla(null);
        if (!puedeUsarSplat(nivel)) {
            setMotivo(MOTIVO_NIVEL_SPLAT);
            return;
        }
        if (!direccion) {
            setMotivo(MOTIVO_SIN_URL_SPLAT);
            return;
        }
        setMotivo(null);
        void (async () => {
            const resultado = await cargarSplat(direccion, { nivel });
            if (!vigente) {
                if (resultado.ok) resultado.malla.dispose?.();
                return;
            }
            if (resultado.ok) {
                setMalla(resultado.malla);
                setMotivo(null);
            } else {
                setMotivo(resultado.motivo);
            }
        })();
        return () => {
            vigente = false;
        };
    }, [direccion, nivel]);

    useEffect(() => {
        if (!malla) return;
        return () => malla.dispose?.();
    }, [malla]);

    if (!malla) return <MarcadorSplat objeto={objeto} motivo={motivo ?? "Cargando splat…"} />;
    return (
        <primitive
            object={malla as unknown as Object3D}
            position={objeto.pos}
            rotation={objeto.rot}
            scale={objeto.esc}
        />
    );
}
