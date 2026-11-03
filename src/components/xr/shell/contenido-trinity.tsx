"use client";

/**
 * StarSeed XR · CONTENIDO DE LA TRINITY (XR1010AS · contrato §3 a–h). Montaje final: reúne lo que
 * dejaron las tareas M–AP y lo entrega al rig (XR1010J) y al menú de mano (XR1010N). Las decisiones
 * nuevas son puras y se prueban sin WebGL; los cascarones R3F solo las aplican.
 */

import { type ReactNode, useMemo } from "react";
import { validarMundo } from "@/lib/xr/mundo-spec";
import { disponerTrinity } from "@/lib/xr/espacio-trinity";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import type { Mano, ModoXR, NivelCalidad, Postura } from "@/lib/xr/tipos";
import { AvatarRemotoXR } from "@/components/vivo/espacial/avatar-remoto-xr";
import { useSesionEscena } from "@/components/vivo/espacial/use-sesion-escena";
import type { ContextoAcciones } from "./acciones-xr";
import type { ContenidoNodos } from "./rig-trinity";
import { RigTrinity } from "./rig-trinity";
import { OrbeVoz } from "./orbe-voz";
import { HorizonMontado } from "./horizon-montado";
import { NodoLogic } from "./nodo-logic";
import { Dock3D } from "./dock-3d";
import { MenuMano } from "./menu-mano";
import MundoRender from "./mundo-render";
import { Pantalla3D } from "./pantalla-3d";
import { Pizarra3D } from "./pizarra-3d";
import { useAudioEspacial } from "./use-audio-espacial";

export interface PiezasTrinity {
    zenith?: ReactNode;
    horizon?: ReactNode;
    logic?: ReactNode;
    anchor?: ReactNode;
    menuMano?: ReactNode;
}

/** Nodos con contenido real: una pieza ausente se omite sin romper el rig (nunca un hueco fingido). */
export function armarContenido(p: PiezasTrinity): { contenido: Partial<ContenidoNodos>; menuMano: ReactNode | null } {
    const contenido: Partial<ContenidoNodos> = {};
    for (const id of ["zenith", "horizon", "logic", "anchor"] as const) {
        const pieza = p[id];
        if (pieza != null) contenido[id] = pieza;
    }
    return { contenido, menuMano: p.menuMano ?? null };
}

/** Sin mundo válido no se monta render ni física; con uno válido, sí (§3 g). */
export function debeMontarMundo(mundo: MundoSpec | null | undefined): mundo is MundoSpec {
    return mundo != null && validarMundo(mundo).ok;
}

const NADA = (): void => undefined;

/** `salir` siempre llega: sin callback, vuelve al escritorio 2D (núcleo: nunca dejar atrapado). */
export function contextoDeAcciones(p: Partial<ContextoAcciones> = {}): ContextoAcciones {
    const salir = async (): Promise<void> => {
        if (typeof window !== "undefined") window.location.assign("/dashboard");
    };
    return {
        recentrar: NADA, salir, abrirMenuMano: NADA, abrirDock: NADA, hablar: NADA, atras: NADA,
        seleccionar: NADA, agarrar: NADA, teletransporte: NADA, girar: NADA, ...p,
    };
}

export interface PropsContenidoTrinity {
    modo: ModoXR;
    nivel: NivelCalidad;
    alturaOjos?: number | null;
    postura?: Postura;
    manoDominante?: Mano;
    nivelActual?: NivelCalidad;
    motivoCalidad?: string;
    mundo?: MundoSpec | null;
    /** Identificador de la sala abierta: sin él no hay presencia que mostrar. */
    refSala?: string | null;
    acciones?: Partial<ContextoAcciones>;
    /** Parámetros 3D de la Protomolécula (XR1010AP), si ya dejó su controlador. */
    parametros?: ReactNode;
    /** Página declarativa ya resuelta (UiSpec) que se pinta junto al nodo Logic. */
    logicExtra?: ReactNode;
    abrirApp?: (id: string) => void;
}

export function ContenidoTrinity({
    modo, nivel, alturaOjos = null, postura = "de-pie", manoDominante = "derecha",
    nivelActual = nivel, motivoCalidad = "Sin cambios desde que entraste.", mundo = null,
    refSala = null, acciones, parametros = null, logicExtra = null, abrirApp,
}: PropsContenidoTrinity) {
    const altura = alturaOjos ?? 1.6;
    const disposicion = disponerTrinity({ alturaOjos: altura, postura, manoDominante, modo });
    // Audio espacial (§3 h) y personas de la sala (XR1010AC, canal ya envuelto por protegerConexion).
    useAudioEspacial({ nivel, salaId: refSala ?? "os", salaPublica: true });
    const { sesion, avatares } = useSesionEscena(useMemo(() => (refSala ? { tipo: "espacio" as const, id: refSala } : null), [refSala]));
    const { contenido, menuMano } = armarContenido({
        zenith: <OrbeVoz />,
        horizon: <><HorizonMontado />{parametros}</>,
        logic: <><NodoLogic nivelActual={nivelActual} motivoUltimoCambio={motivoCalidad} />{logicExtra}</>,
        anchor: <Dock3D alturaOjos={altura} modo={modo} nivel={nivel} postura={postura} abrir={abrirApp} />,
        menuMano: <MenuMano nodo={disposicion.nodos.menuMano} contexto={contextoDeAcciones(acciones)}
            manoDominante={manoDominante} postura={postura} nivel={nivel} />,
    });
    const conMundo = debeMontarMundo(mundo);
    return (
        <>
            <RigTrinity modo={modo} nivel={nivel} alturaOjosMedida={alturaOjos} contenido={contenido} />
            {menuMano}
            {conMundo ? <MundoRender mundo={mundo} nivel={nivel} posicion={disposicion.nodos.anchor.posicion} /> : null}
            {conMundo ? mundo.pantallas.map((p) => <Pantalla3D key={p.id} pantalla={p} capas={false} />) : null}
            {conMundo ? mundo.pizarras.map((p) => <Pizarra3D key={p.id} pizarra={p} />) : null}
            {sesion ? avatares.otros.map((a) => (
                <AvatarRemotoXR key={a.clave} meta={a} poses={sesion.poses} nivel={nivel}
                    jugadoresVisibles={avatares.otros.length} reducido={false} adn={null} />
            )) : null}
        </>
    );
}
