"use client";

/**
 * StarSeed XR · PANEL DE CRISTAL (XR1010H, contrato §3 b). El panel de la Trinity en uikit: material
 * por nivel de calidad (nunca más caro de lo pedido), borde de acento del nodo y texto que jamás se
 * pinta por debajo de 1° de arco. Los colores salen SOLO de `tokens-3d.ts`. La lógica vive en
 * funciones puras exportadas aquí y en `material-cristal.ts`; el componente es un cascarón fino.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Container, Text, type TextProperties } from "@react-three/uikit";
import type { MaterialClass } from "@pmndrs/uikit";
import * as THREE from "three";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import { altoMinimoTexto, type PreferenciasConfort } from "@/lib/xr/confort";
import { TEXTO_MIN_DEG } from "@/lib/xr/espacio-trinity";
import {
    COLORES_NODO,
    CRISTAL,
    opacidadMinimaParaTexto,
    paramsMaterial,
    type NodoCardinal,
    type ParamsMaterial,
} from "@/lib/xr/tokens-3d";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { crearClaseMaterial } from "./material-cristal";
import { usePrefsXR } from "./use-prefs-xr";

export const NivelCalidadContext = createContext<NivelCalidad>("media");
export const useNivelCalidad = (): NivelCalidad => useContext(NivelCalidadContext);

export interface OpcionesPanel {
    reducirTransparencia: boolean;
    contrasteAlto: boolean;
    opacidadMinima: number;
}

export function opcionesDeMaterial(
    confort: Pick<PreferenciasConfort, "reducirTransparencia" | "contrasteAlto">,
    opacidadMinima: number = opacidadMinimaParaTexto(),
): OpcionesPanel {
    return {
        reducirTransparencia: confort.reducirTransparencia,
        contrasteAlto: confort.contrasteAlto,
        opacidadMinima,
    };
}

export function materialDePanel(nodo: NodoCardinal, nivel: NivelCalidad, opciones: OpcionesPanel): ParamsMaterial {
    return paramsMaterial(PERFILES[nivel].material, nodo, opciones);
}

/** Tamaño de texto (m) que nunca baja del mínimo angular ni del que pida quien pinta. */
export function tamanoTexto3D(distancia: number, grados: number = TEXTO_MIN_DEG, fontSize?: number): number {
    return Math.max(fontSize ?? 0, altoMinimoTexto(distancia, grados));
}

export interface PanelCristalProps {
    nodo: NodoCardinal;
    ancho: number;
    alto: number;
    curvatura?: number;
    nivel?: NivelCalidad;
    children?: ReactNode;
}

export function PanelCristal({ nodo, ancho, alto, curvatura, nivel, children }: PanelCristalProps) {
    const delContexto = useNivelCalidad();
    const nivelEfectivo = nivel ?? delContexto;
    const { confort } = usePrefsXR();
    const { params, clase } = useMemo(() => {
        const p = materialDePanel(nodo, nivelEfectivo, opcionesDeMaterial(confort));
        return { params: p, clase: crearClaseMaterial(THREE, p) as unknown as MaterialClass };
    }, [nodo, nivelEfectivo, confort]);

    return (
        <Container
            width={ancho}
            height={alto}
            borderBend={curvatura}
            panelMaterialClass={clase}
            backgroundColor={params.color}
            borderColor={COLORES_NODO[nodo].vivo}
            borderTopWidth={params.borde.ancho}
            borderRightWidth={params.borde.ancho}
            borderBottomWidth={params.borde.ancho}
            borderLeftWidth={params.borde.ancho}
            flexDirection="column"
            padding={0.02}
            opacity={params.opacidad}
        >
            {children}
        </Container>
    );
}

export type Texto3DProps = Omit<TextProperties, "children" | "fontSize"> & {
    distancia: number;
    grados?: number;
    fontSize?: number;
    children?: ReactNode;
};

/** Texto del panel: impone `fontSize ≥ altoMinimoTexto(distancia, grados ?? TEXTO_MIN_DEG)`. */
export function Texto3D({ distancia, grados, fontSize, children, ...resto }: Texto3DProps) {
    return (
        <Text {...resto} color={CRISTAL.texto} fontSize={tamanoTexto3D(distancia, grados, fontSize)}>
            {children}
        </Text>
    );
}
