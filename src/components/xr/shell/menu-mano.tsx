"use client";

/**
 * StarSeed XR · MENÚ DE MANO (XR1010N · contrato `architecture/starseed-xr.md` §3 a/e).
 * Cascarón fino de la Trinity: se muestra cuando el detector `palma-a-la-cara` (XR1010K) se activa
 * en la mano NO dominante, o —con mando— al pulsar el gatillo `menu-mano` del mapa (A/X izquierdo
 * por defecto, nunca el botón del sistema). Se pega a la muñeca (`wrist` de la mano, o el
 * `gripSpace` del mando como respaldo) con `posicionMenu` (puro) y se desvanece con `Animado`
 * (foco/desfoco). Los iconos… los botones llaman a `ejecutarAccion` (XR1010L); un ítem sin efecto
 * real (calidad/ajustes sin panel cableado) no se pinta. El pellizco de palma NUNCA se usa: es del
 * sistema del visor. Cableado en el nodo `menuMano` del rig: XR1010AS.
 */
import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGetXRSpaceMatrix, useXRInputSourceState } from "@react-three/xr";
import { Matrix4, Quaternion, Vector3, type Group } from "three";
import type { Mano, Vec3, NivelCalidad } from "../../../lib/xr/tipos";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";
import { CRISTAL } from "../../../lib/xr/tokens-3d";
import { crearDetector, type Articulaciones } from "../../../lib/xr/gestos";
import { ejecutarAccion, leerFuentes, type ContextoAcciones } from "./acciones-xr";
import { botonMenuMando, itemsMenuMano, posicionMenu, type ItemMenuMano } from "./menu-mano-items";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { pixeles } from "./material-cristal";
import { MAPAS_DEFECTO } from "../../../lib/xr/vinculos-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { Container } from "@react-three/uikit";

const aObjetos = (art: Record<string, Vec3>): Articulaciones =>
    Object.fromEntries(Object.entries(art).map(([nombre, [x, y, z]]) => [nombre, { x, y, z }]));

export interface PropsMenuMano {
    /** Nodo `menuMano` de `disponerTrinity` (anclaje `muneca`): desplazamiento local y tamaño. */
    nodo: NodoEspacial;
    contexto: ContextoAcciones;
    /** La voz ya está hablando: el ítem `hablar` muestra «Silenciar». */
    hablando?: boolean;
    calidadAuto?: boolean;
    mano?: Mano;
    nivel?: NivelCalidad;
    alAbrirCalidad?: () => void;
    alAbrirAjustes?: () => void;
}

export function MenuMano({
    nodo, contexto, hablando = false, calidadAuto = true, mano, nivel, alAbrirCalidad, alAbrirAjustes,
}: PropsMenuMano) {
    const { confort, vinculos } = usePrefsXR();
    const noDominante: Mano = mano ?? (confort.manoDominante === "izquierda" ? "derecha" : "izquierda");
    const ladera: "left" | "right" = noDominante === "izquierda" ? "left" : "right";
    const envMano = useXRInputSourceState("hand", ladera);
    const envMando = useXRInputSourceState("controller", ladera);
    const espacioMuneca = useMemo(
        () => envMano?.inputSource.hand.get("wrist") ?? envMando?.inputSource.gripSpace ?? undefined,
        [envMano, envMando],
    );
    const leerMatriz = useGetXRSpaceMatrix(espacioMuneca);
    const gl = useThree((s) => s.gl);
    const [abierto, setAbierto] = useState(false);
    const [presente, setPresente] = useState(false);
    const abrir = (): void => { setPresente(true); setAbierto(true); };
    const cerrar = (): void => setAbierto(false);
    const detector = useMemo(() => crearDetector("palma-a-la-cara"), []);
    const gatilloMando = useMemo(() => botonMenuMando(vinculos.mandos ?? MAPAS_DEFECTO.mandos), [vinculos.mandos]);
    const grupo = useRef<Group>(null);
    const utiles = useMemo(() => ({ m: new Matrix4(), p: new Vector3(), q: new Quaternion(), e: new Vector3() }), []);
    const prevBoton = useRef<Record<string, boolean>>({});

    useFrame((estado) => {
        const sesion = gl.xr.getSession();
        if (!sesion) return;
        const frame = gl.xr.getFrame();
        const referencia = gl.xr.getReferenceSpace();
        const cabeza = { x: estado.camera.position.x, y: estado.camera.position.y, z: estado.camera.position.z };
        for (const lectura of leerFuentes(sesion, (junta) => {
            const pose = frame && referencia ? frame.getJointPose?.(junta as XRJointSpace, referencia) : undefined;
            return pose ? [pose.transform.position.x, pose.transform.position.y, pose.transform.position.z] : null;
        })) {
            if (lectura.esMano && lectura.mano === noDominante) {
                const r = detector.actualizar(aObjetos(lectura.articulaciones), { cabeza }, performance.now());
                if (r.flanco === "sube") abrir();
                else if (r.flanco === "baja") cerrar();
            } else if (!lectura.esMano && gatilloMando && lectura.mano === gatilloMando.mano) {
                const pulsado = lectura.botones[gatilloMando.indice] === true;
                if (pulsado && !prevBoton.current[noDominante]) abierto ? cerrar() : abrir();
                prevBoton.current[noDominante] = pulsado;
            }
        }
        if (!grupo.current || !leerMatriz || !leerMatriz(utiles.m, frame ?? undefined)) return;
        utiles.m.decompose(utiles.p, utiles.q, utiles.e);
        const pose = posicionMenu(
            { pos: [utiles.p.x, utiles.p.y, utiles.p.z], rot: [utiles.q.x, utiles.q.y, utiles.q.z, utiles.q.w] },
            noDominante, nodo,
        );
        grupo.current.position.set(pose.posicion[0], pose.posicion[1], pose.posicion[2]);
        grupo.current.quaternion.set(pose.rotacion[0], pose.rotacion[1], pose.rotacion[2], pose.rotacion[3]);
    });

    const items = itemsMenuMano({ postura: confort.postura, hablando, calidadAuto }).filter(
        (item) => (item.id === "calidad" ? !!alAbrirCalidad : item.id === "ajustes" ? !!alAbrirAjustes : true),
    );
    const alPulsar = (item: ItemMenuMano): void => {
        if (item.accion === "calidad") alAbrirCalidad?.();
        else if (item.accion === "ajustes") alAbrirAjustes?.();
        else ejecutarAccion(item.accion, contexto);
        cerrar();
    };
    return (
        <group ref={grupo} visible={presente}>
            {presente && (
                <Animado evento={abierto ? "foco" : "desfoco"} salir={!abierto} nivel={nivel} alTerminar={() => setPresente(false)}>
                    <PanelCristal nodo="anchor" ancho={nodo.ancho} alto={nodo.alto}>
                        <Container flexDirection="column" width={pixeles(nodo.ancho)}>
                            {items.map((item) => (
                                <Container
                                    key={item.id} width={pixeles(nodo.ancho)} onClick={() => alPulsar(item)} cursor="pointer"
                                    paddingTop={7} paddingBottom={7} paddingLeft={14} paddingRight={14}
                                    borderWidth={1} borderColor={CRISTAL.borde.color}
                                >
                                    <Texto3D distancia={nodo.distancia}>{item.etiqueta}</Texto3D>
                                </Container>
                            ))}
                        </Container>
                    </PanelCristal>
                </Animado>
            )}
        </group>
    );
}
