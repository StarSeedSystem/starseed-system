"use client";

/**
 * StarSeed XR · MENÚ DE MANO (XR1010N · contrato §3 a). Cascarón fino: lista y colocación en
 * `menu-mano-items.ts` (puro), palma hacia la cara con la lógica de `gestos.ts` (XR1010K, que
 * nunca usa los gestos reservados del sistema del visor) y botones por `ejecutarAccion`
 * (XR1010L). Vive en la mano NO dominante: se abre con la palma hacia la cara o con el botón
 * `menu-mano` del mapa de mandos (por defecto el A/X izquierdo). La muñeca se lee de la
 * articulación `wrist`, con el `grip-space` del mando como respaldo. XR1010AS lo cablea.
 */
import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Container } from "@react-three/uikit";
import type { Group } from "three";
import type { Mano, Vec3 } from "../../../lib/xr/tipos";
import type { NodoEspacial } from "../../../lib/xr/espacio-trinity";
import { disponerTrinity } from "../../../lib/xr/espacio-trinity";
import { activacionMenu, type Articulaciones } from "../../../lib/xr/entrada-tipos";
import { normalDePalma } from "../../../lib/xr/gestos";
import type { AccionXR } from "../../../lib/xr/vinculos-xr";
import { ejecutarAccion, type ContextoAcciones } from "./acciones-xr";
import { usePrefsXR } from "./use-prefs-xr";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { botonMenuMando, itemsMenuMano, posicionMenu, type AccionItemMenu, type Muneca } from "./menu-mano-items";

export interface PropsMenuMano {
    /** Acciones reales del rig; cada botón llama a `ejecutarAccion`. */
    acciones: ContextoAcciones;
    /** Mano dominante de la persona; el menú vive en la otra. */
    manoDominante?: Mano;
    /** Nodo `menuMano` de la disposición (XR1010AS); si falta, se calcula para VR de pie. */
    nodo?: NodoEspacial;
    /** Micrófono abierto: el botón muestra «Silenciar». */
    hablando?: boolean;
    /** Abre el panel Logic de ajustes; si falta, se ve «próximamente: abrir ajustes». */
    abrirAjustes?: () => void;
}

export function MenuMano({ acciones, manoDominante = "derecha", nodo, hablando = false, abrirAjustes }: PropsMenuMano) {
    const { confort, calidad, setCalidad } = usePrefsXR();
    const mano = manoDominante === "derecha" ? "izquierda" : "derecha";
    const boton = useMemo(() => botonMenuMando(), []);
    const nodoEfectivo = useMemo(
        () => nodo ?? disposicionDe(manoDominante, confort.postura),
        [nodo, manoDominante, confort.postura],
    );
    const [abierto, setAbierto] = useState(false);
    const [montado, setMontado] = useState(false);
    const ref = useRef<Group>(null);
    const previo = useRef({ mando: false, palma: false });
    const gl = useThree((e) => e.gl);
    useFrame((estado) => {
        const l = leerMuneca(gl.xr.getSession(), gl.xr.getFrame(), gl.xr.getReferenceSpace(), mano, boton, estado.camera.position);
        if (l && ref.current && l.muneca) {
            const p = posicionMenu(l.muneca, mano, nodoEfectivo);
            ref.current.position.set(p.posicion[0], p.posicion[1], p.posicion[2]);
            ref.current.quaternion.fromArray(p.quat);
        }
        if (!l) return;
        const flancoPalma = l.palma !== previo.current.palma;
        const flancoMando = l.mando && !previo.current.mando;
        previo.current = { mando: l.mando, palma: l.palma };
        if (flancoPalma) { setAbierto(l.palma); if (l.palma) setMontado(true); }
        if (flancoMando) { setMontado(true); setAbierto((a) => !a); }
    });
    const calidadAuto = calidad.modo === "auto";
    const items = itemsMenuMano({ postura: confort.postura, hablando, calidadAuto });
    const elegir = (accion: AccionItemMenu): void => {
        if (accion === "calidad") { setCalidad({ modo: calidadAuto ? "media" : "auto" }); return; }
        if (accion === "ajustes") { abrirAjustes?.(); return; }
        ejecutarAccion(accion as AccionXR, acciones);
    };
    const alto = Math.max(0.075 * items.length + 0.03, nodoEfectivo.alto);
    return !montado ? null : (
        <Animado evento={abierto ? "foco" : "desfoco"} salir={!abierto} alTerminar={() => setMontado(false)} distancia={nodoEfectivo.distancia}>
            <group ref={ref}>
                <PanelCristal nodo="logic" ancho={nodoEfectivo.ancho} alto={alto} opacidadMinima={0.82}>
                    {items.map((i) =>
                        i.accion === "ajustes" && !abrirAjustes ? (
                            <Texto3D key={i.id} distancia={nodoEfectivo.distancia}>próximamente: abrir ajustes</Texto3D>
                        ) : (
                            <Container key={i.id} onClick={() => elegir(i.accion)} cursor="pointer" paddingTop={8} paddingBottom={8}>
                                <Texto3D distancia={nodoEfectivo.distancia}>{i.etiqueta}</Texto3D>
                            </Container>
                        ),
                    )}
                </PanelCristal>
            </group>
        </Animado>
    );
}

const disposicionDe = (dominante: Mano, postura: PropsMenuMano["nodo"] extends never ? never : Mano): NodoEspacial =>
    disponerTrinity({ alturaOjos: 1.6, postura: "de-pie", manoDominante: dominante, modo: "vr-inmersivo" }).nodos.menuMano;
void postura;
