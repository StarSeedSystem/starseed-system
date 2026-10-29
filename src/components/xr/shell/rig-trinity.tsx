"use client";

/**
 * StarSeed XR · RIG DE LA TRINITY (XR1010J · contrato §3 a). Cascarón fino de R3F: coloca Zenith,
 * Horizon, Logic y Anchor en las posiciones, rotaciones (euler YXZ del núcleo), curvaturas y
 * tamaños que manda `disponerTrinity`, con entrada escalonada (`Animado`, evento «entrada») y
 * paneles de cristal (XR1010H). Toda la lógica vive en `use-disposicion.ts` (parte pura probada);
 * aquí solo se lee el yaw de la cámara y la pestaña activa del panel compartido. El menú de mano
 * (`menuMano`) lo monta XR1010N y los botones del dock, XR1010M: el contenido llega por props.
 */

import { useCallback, useState, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Container } from "@react-three/uikit";
import type { ModoXR, NivelCalidad } from "@/lib/xr/tipos";
import { CRISTAL, type NodoCardinal } from "@/lib/xr/tokens-3d";
import type { NodoEspacial } from "@/lib/xr/espacio-trinity";
import { Animado } from "./animado";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { useDisposicionTrinity } from "./use-disposicion";

const CARDINALES: readonly NodoCardinal[] = ["zenith", "horizon", "logic", "anchor"] as const;

export type ContenidoNodos = Record<"zenith" | "horizon" | "logic" | "anchor", ReactNode>;

export interface PropsRigTrinity {
    modo: ModoXR;
    /** Nivel de calidad del cristal y de las transiciones; por defecto «media». */
    nivel?: NivelCalidad;
    /** Altura de ojos medida por el visor (XR1010G); manda la manual del confort. */
    alturaOjosMedida?: number | null;
    /** Contenido de cada cardinal: lo rellenan M–O y AG (dock, Astraura, Horizon, Logic). */
    contenido: Partial<ContenidoNodos>;
}

/** Rotación del panel en el orden YXZ que define el núcleo (euler de three con orden explícito). */
const rotacionDe = (n: NodoEspacial): THREE.Euler => new THREE.Euler(n.rotacion.pitch, n.rotacion.yaw, n.rotacion.roll, "YXZ");

export function RigTrinity({ modo, nivel = "media", alturaOjosMedida = null, contenido = {} }: PropsRigTrinity) {
    const camara = useThree((s) => s.camera);
    const [pestaña, setPestaña] = useState<"horizon" | "logic">("horizon");
    const leerYaw = useCallback((): number => {
        // 0 = hacia -z, como mide el núcleo para `yawBase`.
        const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(camara.quaternion);
        return Math.atan2(frente.x, -frente.z);
    }, [camara]);
    const { disposicion } = useDisposicionTrinity({ modo, yawCabeza: leerYaw, alturaOjosMedida });
    const comparten = disposicion.nodos.logic.agrupadoCon === "horizon" && contenido.logic != null;
    return (
        <NivelCalidadContext.Provider value={nivel}>
            {CARDINALES.map((id, i) => {
                const n = disposicion.nodos[id];
                if (!n.visible) return null;
                return (
                    <group key={id} position={n.posicion} rotation={rotacionDe(n)}>
                        <Animado evento="entrada" hermano={{ i, n: CARDINALES.length }} distancia={n.distancia} nivel={nivel}>
                            <PanelCristal
                                nodo={id}
                                ancho={n.ancho}
                                alto={n.alto}
                                curvatura={n.curvatura ?? undefined}
                                opacidadMinima={modo === "ar-passthrough" ? disposicion.opacidadMinima : undefined}
                            >
                                {id === "horizon" && comparten ? (
                                    <PanelCompartido pestaña={pestaña} activar={setPestaña} distancia={n.distancia} contenido={contenido} />
                                ) : (
                                    contenido[id] ?? null
                                )}
                            </PanelCristal>
                        </Animado>
                    </group>
                );
            })}
        </NivelCalidadContext.Provider>
    );
}

interface PropsPanelCompartido {
    pestaña: "horizon" | "logic";
    activar: (p: "horizon" | "logic") => void;
    distancia: number;
    contenido: Partial<ContenidoNodos>;
}

/** Postura de una mano: Horizon y Logic comparten panel con pestañas (núcleo: `agrupadoCon`). */
function PanelCompartido({ pestaña, activar, distancia, contenido }: PropsPanelCompartido) {
    return (
        <>
            <Container flexDirection="row" gap={8}>
                {(["horizon", "logic"] as const).map((id) => (
                    <Container
                        key={id}
                        onClick={() => activar(id)}
                        cursor="pointer"
                        backgroundColor={CRISTAL.fondoB.color}
                        padding={4}
                    >
                        <Texto3D distancia={distancia} tono={id === pestaña ? "texto" : "textoSecundario"}>
                            {id === pestaña ? `▶ ${id === "horizon" ? "Horizonte" : "Logic"}` : id === "horizon" ? "Horizonte" : "Logic"}
                        </Texto3D>
                    </Container>
                ))}
            </Container>
            {contenido[pestaña] ?? null}
        </>
    );
}
