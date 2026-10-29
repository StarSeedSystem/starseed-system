"use client";

/**
 * StarSeed XR · RIG DE LA TRINITY (XR1010J · contrato §3 a). Cascarón fino: Zenith,
 * Horizon, Logic y Anchor colocados, orientados y dimensionados POR `disponerTrinity`
 * (núcleo puro); las animaciones de entrada escalonadas las hace `Animado` (XR1010I) y el
 * cristal `PanelCristal` (XR1010H). El contenido de cada nodo llega por `contenido` para
 * que otras tareas lo rellenen; el menú de mano lo monta XR1010N. En postura `una-mano`,
 * los nodos con `agrupadoCon` comparten el panel del nodo visible; en AR se aplica la
 * `opacidadMinima` de la disposición para que el panel siempre se lea sobre la habitación.
 */
import { useMemo, type ReactNode } from "react";
import { Euler } from "three";
import { Animado } from "./animado";
import { PanelCristal } from "./panel-cristal";
import { useDisposicionTrinity, type ConfigDisposicion } from "./use-disposicion";
import type { NodoCardinal } from "../../../lib/xr/tokens-3d";

const CARDINALES = ["zenith", "horizon", "logic", "anchor"] as const;

export interface PropsRigTrinity extends ConfigDisposicion {
    contenido: Record<NodoCardinal, ReactNode>;
}

export function RigTrinity({ contenido, ...config }: PropsRigTrinity): ReactNode {
    const { disposicion } = useDisposicionTrinity(config);
    const enAR = config.modo === "ar-passthrough";
    const cuerpos = useMemo(() => {
        const porNodo: Record<NodoCardinal, ReactNode[]> = { zenith: [], horizon: [], logic: [], anchor: [] };
        for (const id of CARDINALES) if (disposicion.nodos[id].visible) porNodo[id].push(contenido[id]);
        for (const id of CARDINALES) {
            const agrupadoCon = disposicion.nodos[id].agrupadoCon;
            if (agrupadoCon && agrupadoCon !== "menuMano") {
                const contenedor = disposicion.nodos[agrupadoCon];
                if (contenedor.visible) porNodo[agrupadoCon].push(contenido[id]);
            }
        }
        return porNodo;
    }, [disposicion, contenido]);

    return (
        <>
            {CARDINALES.map((id, i) => {
                const nodo = disposicion.nodos[id];
                const cuerpo = cuerpos[id];
                if (!nodo.visible || cuerpo.length === 0) return null;
                return (
                    <group
                        key={id}
                        position={nodo.posicion}
                        rotation={new Euler(nodo.rotacion.pitch, nodo.rotacion.yaw, nodo.rotacion.roll, "YXZ")}
                    >
                        <Animado evento="entrada" hermano={{ i, n: CARDINALES.length }} distancia={nodo.distancia}>
                            <PanelCristal
                                nodo={id}
                                ancho={nodo.ancho}
                                alto={nodo.alto}
                                curvatura={nodo.curvatura ?? undefined}
                                opacidadMinima={enAR ? disposicion.opacidadMinima : undefined}
                            >
                                {cuerpo}
                            </PanelCristal>
                        </Animado>
                    </group>
                );
            })}
        </>
    );
}

export default RigTrinity;
