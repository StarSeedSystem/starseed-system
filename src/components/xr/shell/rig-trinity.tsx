"use client";

/**
 * StarSeed XR · RIG DE LA TRINITY (XR1010J · contrato §3 a). Cascarón fino: Zenith, Horizon, Logic y
 * Anchor alrededor de la persona, cada uno `Animado` (XR1010I, entrada escalonada) con un `PanelCristal`
 * (XR1010H) en la posición, rotación, curvatura y tamaño que da `disponerTrinity`. Los contenidos llegan
 * por `contenido` (M–O y AG los rellenan); el nodo `menuMano` lo monta XR1010N, nunca este rig.
 **/
import { useEffect } from "react";
import type { ReactNode } from "react";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { useDisposicionTrinity, type OpcionesDisposicion } from "./use-disposicion";
import { MAPAS_DEFECTO } from "@/lib/xr/vinculos-xr";
import type { NodoCardinal } from "@/lib/xr/tokens-3d";
import type { DisposicionTrinity } from "@/lib/xr/espacio-trinity";

export const CARDINALES = ["zenith", "horizon", "logic", "anchor"] as const;
export type ContenidoRig = Record<(typeof CARDINALES)[number], ReactNode>;
export type PropsRigTrinity = OpcionesDisposicion & { contenido?: Partial<ContenidoRig> };

/** Mientras las tareas M–O no rellenen los cardinales, cada panel dice qué faltará allí (nunca finge). */
export const PENDIENTES: Partial<ContenidoRig> = {
    zenith: "próximamente: el orbe y la conversación de Astraura",
    horizon: "próximamente: paleta de creación y destinos",
    logic: "próximamente: calidad, confort, vínculos y privacidad",
    anchor: "próximamente: dock de aplicaciones",
};
const pendiente = (id: NodoCardinal, distancia: number): ReactNode => (
    <Texto3D distancia={distancia}>{PENDIENTES[id] ?? "próximamente: menús 3D"}</Texto3D>
);

/** Contenido del panel de `id` más, como pestaña, el de los nodos ocultos que comparten con él (una-mano). */
export function contenidoPanel(d: DisposicionTrinity, id: NodoCardinal, contenido: Partial<ContenidoRig>): ReactNode {
    const propios = contenido[id] ?? pendiente(id, d.nodos[id].distancia);
    const agrupados = CARDINALES.filter((otro) => otro !== id && !d.nodos[otro].visible && d.nodos[otro].agrupadoCon === id);
    if (agrupados.length === 0) return propios;
    return (
        <>
            {propios}
            {agrupados.map((otro) => (
                <group key={otro} name={`pestaña-${otro}`}>
                    {contenido[otro] ?? pendiente(otro, d.nodos[id].distancia)}
                </group>
            ))}
        </>
    );
}

function NodoRig({ id, i, d, contenido }: { id: NodoCardinal; i: number; d: DisposicionTrinity; contenido: Partial<ContenidoRig> }) {
    const n = d.nodos[id];
    return (
        <group
            name={`nodo-${id}`}
            position={n.posicion}
            rotation-order="YXZ"
            rotation={[n.rotacion.pitch, n.rotacion.yaw, n.rotacion.roll]}
        >
            <Animado evento="entrada" hermano={{ i, n: CARDINALES.length }} distancia={n.distancia}>
                <PanelCristal
                    nodo={id}
                    ancho={n.ancho}
                    alto={n.alto}
                    curvatura={n.curvatura ?? undefined}
                    opacidadMinima={d.opacidadMinima}
                >
                    {contenidoPanel(d, id, contenido)}
                </PanelCristal>
            </Animado>
        </group>
    );
}

export function RigTrinity(o: PropsRigTrinity) {
    const { disposicion: d, recentrar } = useDisposicionTrinity(o);
    // Recentrar con el gatillo de teclado del núcleo (por defecto «C»); el mando y la voz los trae XR1010N.
    const tecla = (MAPAS_DEFECTO["teclado-raton"].recentrar ?? []).find((g) => g.tipo === "tecla");
    useEffect(() => {
        if (!tecla) return;
        const alPulsar = (e: KeyboardEvent) => { if (e.code === tecla.codigo) recentrar(); };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [tecla, recentrar]);
    return (
        <group name="rig-trinity">
            {CARDINALES.map((id, i) => (d.nodos[id].visible ? <NodoRig key={id} id={id} i={i} d={d} contenido={o.contenido ?? {}} /> : null))}
        </group>
    );
}
