"use client";

/**
 * StarSeed XR · MENÚ DE MANO (XR1010N · contrato `architecture/starseed-xr.md` §3 a/e).
 * Cascarón fino de R3F/uikit pegado a la muñeca de la mano NO dominante. Se abre con el detector
 * `palma-a-la-cara` (XR1010K, vía la acción `menu-mano`) o con el botón A/X izquierdo del mando, y
 * se desvanece con `Animado` (foco/desfoco). Los botones llaman a `ejecutarAccion` (XR1010L).
 * El pellizco de palma NO se usa: es del sistema del visor.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useXRInputSourceState } from "@react-three/xr";
import { Container } from "@react-three/uikit";
import type { Group } from "three";
import type { Mano, NivelCalidad, Postura, Vec3 } from "../../../lib/xr/tipos";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";
import { crearDetector, type Articulaciones } from "../../../lib/xr/gestos";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { ejecutarAccion, type ContextoAcciones } from "./acciones-xr";
import { Animado } from "./animado";
import { Texto3D } from "./panel-cristal";
import { itemsMenuMano, manoMenuDe, posicionMenu, type Cuaternion, type ItemMenuMano } from "./menu-mano-items";

export interface PropsMenuMano {
    nodo: NodoEspacial; contexto: ContextoAcciones;
    /** Dominante; el menú viaja siempre en la contraria. */ manoDominante?: Mano;
    postura?: Postura; hablando?: boolean; calidadAuto?: boolean; nivel?: NivelCalidad;
    /** Lo abre el detector `palma-a-la-cara` o la acción `menu-mano` del mando. */ abierto?: boolean;
    /** Si faltan, se pinta «próximamente», nunca un botón muerto. */ alCalidad?: () => void; alAjustes?: () => void;
    distancia?: number;
}

export function MenuMano({
    nodo, contexto, manoDominante = "derecha", postura = "de-pie", hablando = false,
    calidadAuto = true, nivel, abierto = false, alCalidad, alAjustes, distancia = 0.3,
}: PropsMenuMano) {
    const gl = useThree((estado) => estado.gl);
    const mano = manoMenuDe(manoDominante);
    const manoXR = mano === "izquierda" ? "left" : "right";
    const estadoMano = useXRInputSourceState("hand", manoXR);
    const estadoMando = useXRInputSourceState("controller", manoXR);
    const grupo = useRef<Group>(null);
    const detector = useMemo(() => crearDetector("palma-a-la-cara"), []);
    const gestoPrevio = useRef(false);
    const [gesto, setGesto] = useState(false);
    const [montado, setMontado] = useState(false);
    const visible = abierto || gesto;
    const items = useMemo(() => itemsMenuMano({ postura, hablando, calidadAuto }), [postura, hablando, calidadAuto]);

    useEffect(() => { if (visible) setMontado(true); }, [visible]);
    useEffect(() => {
        if (visible || !montado) return undefined;
        const reloj = window.setTimeout(() => setMontado(false), 700);
        return () => window.clearTimeout(reloj);
    }, [visible, montado]);

    useFrame((estado) => {
        const frame = gl.xr.getFrame();
        const referencia = gl.xr.getReferenceSpace();
        const hand = estadoMano?.inputSource?.hand;
        const mando = estadoMando?.inputSource;
        const articulaciones: Articulaciones = {};
        let pose: XRPose | XRJointPose | undefined;
        if (frame && referencia && hand) {
            for (const nombre of ["wrist", "index-finger-metacarpal", "pinky-finger-metacarpal"]) {
                const espacio = hand.get(nombre as XRHandJoint);
                const p = espacio ? frame.getJointPose?.(espacio, referencia) : undefined;
                if (!p) continue;
                articulaciones[nombre] = { x: p.transform.position.x, y: p.transform.position.y, z: p.transform.position.z };
                if (nombre === "wrist") pose = p;
            }
        }
        if (!pose && frame && referencia && mando?.gripSpace) pose = frame.getPose(mando.gripSpace, referencia);
        const cabeza = { x: estado.camera.position.x, y: estado.camera.position.y, z: estado.camera.position.z };
        const activo = hand ? detector.actualizar(articulaciones, { cabeza }, performance.now()).activo : false;
        if (activo !== gestoPrevio.current) { gestoPrevio.current = activo; setGesto(activo); }
        const g = grupo.current;
        if (!g || !pose) return;
        const muneca = {
            pos: [pose.transform.position.x, pose.transform.position.y, pose.transform.position.z] as Vec3,
            rot: [pose.transform.orientation.x, pose.transform.orientation.y, pose.transform.orientation.z, pose.transform.orientation.w] as Cuaternion,
        };
        const p = posicionMenu(muneca, mano, nodo);
        g.position.set(p.posicion[0], p.posicion[1], p.posicion[2]);
        g.quaternion.set(p.rotacion[0], p.rotacion[1], p.rotacion[2], p.rotacion[3]);
    });

    if (!montado) return null;
    const activar = (item: ItemMenuMano): void => {
        if (item.accion === "calidad") { alCalidad?.(); return; }
        if (item.accion === "ajustes") { alAjustes?.(); return; }
        ejecutarAccion(item.accion, contexto);
    };
    return (
        <group ref={grupo} visible={visible}>
            <Animado evento={visible ? "foco" : "desfoco"} nivel={nivel} distancia={distancia}>
                <Container flexDirection="column" gap={4} backgroundColor={CRISTAL.fondoA.color} padding={6}>
                    {items.map((item) => {
                        const sinEfecto = (item.accion === "calidad" && !alCalidad) || (item.accion === "ajustes" && !alAjustes);
                        return (
                            <Container
                                key={item.id}
                                onClick={sinEfecto ? undefined : () => activar(item)}
                                cursor={sinEfecto ? "default" : "pointer"}
                                padding={4}
                                backgroundColor={CRISTAL.fondoB.color}
                            >
                                <Texto3D distancia={distancia} tono={sinEfecto ? "textoSecundario" : "texto"}>
                                    {sinEfecto ? `próximamente: ${item.etiqueta}` : item.etiqueta}
                                </Texto3D>
                            </Container>
                        );
                    })}
                </Container>
            </Animado>
        </group>
    );
}
