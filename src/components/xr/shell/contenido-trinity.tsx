"use client";

/**
 * StarSeed XR · CONTENIDO DE LA TRINITY (XR1010AS · contrato §3 a–h). Arma lo que pinta cada
 * cardinal del rig (XR1010J): Zenith = Astraura + voz, Horizon = crear/destinos + parámetros,
 * Logic = sistema, Anchor = dock; más el menú de mano. Solo monta lo que existe de verdad: una
 * pieza ausente se omite (nunca un sustituto) y se enumera al director.
 */
import { useEffect, useState, type ReactNode } from "react";
import type { ContextoCompartir } from "./ejecutor-compartir";
import type { ContextoMundo } from "./ejecutor-mundo";
import { refSalaDeUrl } from "./ejecutor-mundo";
import type { ContextoAcciones } from "./acciones-xr";
import { disponerTrinity } from "@/lib/xr/espacio-trinity";
import { validarMundo } from "@/lib/xr/mundo-spec";
import type { MundoSpec } from "@/lib/xr/mundo-tipos";
import { NivelCalidadContext } from "./panel-cristal";
import { RigTrinity, type ContenidoNodos } from "./rig-trinity";
import { usePrefsXR } from "./use-prefs-xr";
import { controladorActivo } from "@/lib/protomolecula/controlador-activo";
import { candidatosDe } from "@/lib/protomolecula/registro-atomos";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import { OrbeAstraura } from "./orbe-astraura";
import { FlujoVoz } from "./flujo-voz";
import { HorizonMontado } from "./horizon-montado";
import { Parametros3D } from "./parametros-3d";
import { NodoLogic } from "./nodo-logic";
import Dock3D from "./dock-3d";
import { MenuMano } from "./menu-mano";
import MundoRender from "./mundo-render";
import { Pantalla3D } from "./pantalla-3d";
import { Pizarra3D, crearEstadoPizarra } from "./pizarra-3d";
import type { ModoXR, NivelCalidad } from "@/lib/xr/tipos";

export type PiezaTrinity = "orbe" | "flujo-voz" | "horizon" | "parametros" | "logic" | "dock" | "menu-mano";
export type NodoContenido = "zenith" | "horizon" | "logic" | "anchor" | "menuMano";
export type PiezasPorNodo = Record<NodoContenido, PiezaTrinity[]>;

/** Qué pieza va en cada nodo. Es el contrato de §3 a: no se decide en el render. */
export const PIEZAS_TRINITY: PiezasPorNodo = {
    zenith: ["orbe", "flujo-voz"],
    horizon: ["horizon", "parametros"],
    logic: ["logic"],
    anchor: ["dock"],
    menuMano: ["menu-mano"],
};

/** Cada nodo recibe SOLO las piezas disponibles, en el orden del contrato. */
export function piezasDelNodo(disponibles: readonly PiezaTrinity[]): PiezasPorNodo {
    const hay = new Set(disponibles);
    const filtrado = (nodo: NodoContenido): PiezaTrinity[] => PIEZAS_TRINITY[nodo].filter((p) => hay.has(p));
    return { zenith: filtrado("zenith"), horizon: filtrado("horizon"), logic: filtrado("logic"), anchor: filtrado("anchor"), menuMano: filtrado("menuMano") };
}

/** Un mundo solo se pinta si `validarMundo` lo acepta; si no, no se finge uno. */
export function debeMontarMundo(m: MundoSpec | null | undefined): m is MundoSpec {
    return m != null && validarMundo(m).ok;
}

/** El mundo abierto sale de la MISMA fila de la sala que ya lee la voz (`?mundo=` o `/sala-xr/<id>`). */
export function useMundoAbierto(): MundoSpec | null {
    const [mundo, setMundo] = useState<MundoSpec | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const refId = refSalaDeUrl(window.location.pathname, window.location.search);
        if (!refId) return;
        let vivo = true;
        void leerMundo(refId).then((m) => { if (vivo) setMundo(m); }).catch(() => undefined);
        return () => { vivo = false; };
    }, []);
    return mundo;
}

export interface PropsContenidoTrinity {
    modo: ModoXR;
    nivel: NivelCalidad;
    alturaOjosMedida?: number | null;
    mundo?: MundoSpec | null;
    /** Contextos reales de voz (XR1010T); sin ellos, FlujoVoz no se monta. */
    voz?: { mundo: ContextoMundo; compartir: ContextoCompartir } | null;
    /** Acciones de XR1010L; sin ellas el menú de mano no se pinta. */
    acciones?: ContextoAcciones | null;
    menuAbierto?: boolean;
    alCalidad?: () => void;
    alAjustes?: () => void;
}

export function ContenidoTrinity({ modo, nivel, alturaOjosMedida = null, mundo = null, voz = null, acciones = null, menuAbierto = false, alCalidad, alAjustes }: PropsContenidoTrinity) {
    const { confort } = usePrefsXR();
    const altura = alturaOjosMedida ?? confort.alturaOjos ?? 1.6;
    const disposicion = disponerTrinity({ alturaOjos: altura, postura: confort.postura, manoDominante: confort.manoDominante, modo });
    const controlador = controladorActivo();
    const disponibles: PiezaTrinity[] = ["orbe", "horizon", "logic", "dock", "menu-mano"];
    if (voz) disponibles.push("flujo-voz");
    if (controlador) disponibles.push("parametros");
    const piezas = piezasDelNodo(disponibles);
    const parametros = controlador ? <Parametros3D controlador={controlador} candidatos={candidatosDe(controlador.obtener().molecula)} /> : null;
    const contenido: Partial<ContenidoNodos> = {
        zenith: <>{piezas.zenith.includes("orbe") && <OrbeAstraura />}{piezas.zenith.includes("flujo-voz") && voz && <FlujoVoz mundo={voz.mundo} compartir={voz.compartir} nivel={nivel} />}</>,
        horizon: <>{piezas.horizon.includes("horizon") && <HorizonMontado />}{parametros}</>,
        logic: piezas.logic.includes("logic") ? <NodoLogic nivelActual={nivel} /> : null,
        anchor: piezas.anchor.includes("dock") ? <Dock3D nivel={nivel} modo={modo} alturaOjos={altura} /> : null,
    };
    return (
        <NivelCalidadContext.Provider value={nivel}>
            <RigTrinity modo={modo} nivel={nivel} alturaOjosMedida={alturaOjosMedida} contenido={contenido} />
            {piezas.menuMano.includes("menu-mano") && acciones && (
                <MenuMano nodo={disposicion.nodos.menuMano} contexto={acciones} manoDominante={confort.manoDominante} postura={confort.postura} nivel={nivel} abierto={menuAbierto} alCalidad={alCalidad} alAjustes={alAjustes} />
            )}
            {debeMontarMundo(mundo) && <MundoRender mundo={mundo} nivel={nivel} />}
            {debeMontarMundo(mundo) && mundo.pantallas.map((p) => <Pantalla3D key={p.id} pantalla={p} capas={false} />)}
            {debeMontarMundo(mundo) && mundo.pizarras.map((p) => <Pizarra3D key={p.id} pizarra={p} sala={null} usuarioId={null} estado={crearEstadoPizarra(p.salaId ?? p.id)} />)}
        </NivelCalidadContext.Provider>
    );
}

export default ContenidoTrinity;
