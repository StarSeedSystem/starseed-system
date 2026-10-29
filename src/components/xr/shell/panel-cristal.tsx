"use client";

/**
 * StarSeed XR · PANEL DE CRISTAL (XR1010H · contrato `architecture/starseed-xr.md` §3 b).
 *
 * Cascarón fino de uikit: el material (clase y args) y el tamaño mínimo del texto salen de
 * funciones puras (`material-cristal.ts`); aquí solo se leen el nivel de calidad, las
 * preferencias de confort y los tokens. Ningún color se escribe a mano. Los motores pesados
 * viven en `src/components/xr/shell/**`, nunca en el layout raíz.
 */
import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Container, Text } from "@react-three/uikit";
import * as THREE from "three";
import { CRISTAL, COLORES_NODO, paramsMaterial, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import { PERFILES } from "../../../lib/xr/calidad-perfiles";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import { TEXTO_MIN_DEG } from "../../../lib/xr/espacio-trinity";
import { usePrefsXR } from "./use-prefs-xr";
import {
    claseMaterialPanel,
    colorConAlfa,
    curvaturaABorde,
    fontSizeTexto,
    pixeles,
    type ThreeMinimo,
} from "./material-cristal";

/** Nivel de calidad vigente en la escena; por defecto «media», como `PERFILES`. */
export const NivelCalidadContext = createContext<NivelCalidad>("media");

type ClasePanel = ComponentProps<typeof Container>["panelMaterialClass"];

export interface PropsPanelCristal {
    nodo: NodoCardinal;
    /** Ancho y alto en metros. */
    ancho: number;
    alto: number;
    /** Radio de curvatura en metros; `undefined` = plano. */
    curvatura?: number;
    /** Nivel explícito; si falta, se lee `NivelCalidadContext`. */
    nivel?: NivelCalidad;
    /** Opacidad mínima del modo (AR: 0,82). */
    opacidadMinima?: number;
    children?: ReactNode;
}

export function PanelCristal({ nodo, ancho, alto, curvatura, nivel, opacidadMinima, children }: PropsPanelCristal) {
    const delContexto = useContext(NivelCalidadContext);
    const { confort } = usePrefsXR();
    const nivelEfectivo = nivel ?? delContexto;
    const params = paramsMaterial(PERFILES[nivelEfectivo].material, nodo, {
        reducirTransparencia: confort.reducirTransparencia,
        contrasteAlto: confort.contrasteAlto,
        opacidadMinima,
    });
    const Clase = claseMaterialPanel(THREE as unknown as ThreeMinimo, params);
    // uikit multiplica el color del material por `backgroundColor`: el blanco del token lo deja intacto.
    return (
        <Container
            width={pixeles(ancho)}
            height={pixeles(alto)}
            flexDirection="column"
            backgroundColor={CRISTAL.borde.color}
            borderColor={colorConAlfa(COLORES_NODO[nodo].vivo, params.borde.opacidad)}
            borderTopWidth={pixeles(params.borde.ancho)}
            borderRightWidth={pixeles(params.borde.ancho)}
            borderBottomWidth={pixeles(params.borde.ancho)}
            borderLeftWidth={pixeles(params.borde.ancho)}
            borderBend={curvaturaABorde(curvatura)}
            panelMaterialClass={Clase as unknown as ClasePanel}
        >
            {children}
        </Container>
    );
}

export type TonoTexto = "texto" | "textoSecundario";

export interface PropsTexto3D {
    /** Distancia de la persona al texto, en metros. */
    distancia: number;
    /** Tamaño angular mínimo en grados; por defecto 1°. */
    grados?: number;
    /** Tamaño pedido por quien pinta; se sube al mínimo si hace falta. */
    fontSize?: number;
    tono?: TonoTexto;
    children?: ReactNode;
}

/** Texto 3D que NUNCA se pinta por debajo de 1° de arco (contrato §3 a). */
export function Texto3D({ distancia, grados, fontSize, tono = "texto", children }: PropsTexto3D) {
    const tamano = fontSizeTexto(distancia, grados ?? TEXTO_MIN_DEG, fontSize);
    return (
        <Text fontSize={tamano} color={CRISTAL[tono]}>
            {children}
        </Text>
    );
}
