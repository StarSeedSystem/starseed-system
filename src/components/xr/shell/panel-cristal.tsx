"use client";

/**
 * StarSeed XR · PANEL DE CRISTAL 3D (XR1010H, §3 b). Envuelve `Container` de uikit con el material
 * del nivel de calidad (`PERFILES[nivel].material`), el borde de acento del nodo y el nivel leído
 * del contexto. También exporta `Texto3D`, que nunca pinta texto por debajo de 1° de arco. Los
 * colores salen SOLO de `tokens-3d.ts`; three/uikit viven únicamente en este chunk XR.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Container, Text, type TextProperties } from "@react-three/uikit";
import * as THREE from "three";
import { COLORES_NODO, CRISTAL, paramsMaterial, type NodoCardinal } from "@/lib/xr/tokens-3d";
import { PERFILES } from "@/lib/xr/calidad-perfiles";
import type { NivelCalidad } from "@/lib/xr/tipos";
import { usePrefsXR } from "./use-prefs-xr";
import { crearClaseMaterial, tamanoTextoMinimo, type ThreeMinimo } from "./material-cristal";

/** Nivel efectivo de toda la escena; cada panel puede pisarlo con su prop `nivel`. */
export const NivelCalidadContext = createContext<NivelCalidad>("media");

export interface PanelCristalProps {
    nodo: NodoCardinal;
    ancho: number;
    alto: number;
    curvatura?: number;
    nivel?: NivelCalidad;
    opacidadMinima?: number;
    children?: ReactNode;
}

export function PanelCristal({ nodo, ancho, alto, curvatura = 0, nivel, opacidadMinima, children }: PanelCristalProps) {
    const delContexto = useContext(NivelCalidadContext);
    const { confort } = usePrefsXR();
    const nivelEfectivo = nivel ?? delContexto;
    const { Clase, p } = useMemo(() => {
        const material = paramsMaterial(PERFILES[nivelEfectivo].material, nodo, {
            reducirTransparencia: confort.reducirTransparencia,
            contrasteAlto: confort.contrasteAlto,
            opacidadMinima,
        });
        return { Clase: crearClaseMaterial(THREE as unknown as ThreeMinimo, material), p: material };
    }, [nivelEfectivo, nodo, confort.reducirTransparencia, confort.contrasteAlto, opacidadMinima]);
    return (
        <Container
            width={ancho}
            height={alto}
            borderBend={curvatura}
            borderWidth={p.borde.ancho}
            borderColor={COLORES_NODO[nodo].vivo}
            backgroundColor={p.color}
            panelMaterialClass={Clase}
        >
            {children}
        </Container>
    );
}

export type Texto3DProps = Omit<TextProperties, "fontSize" | "children" | "color"> & {
    distancia: number;
    grados?: number;
    color?: string;
    children?: ReactNode;
};

/** Texto del panel: su `fontSize` se calcula para medir al menos `grados` (1° por defecto) a `distancia`. */
export function Texto3D({ distancia, grados, color = CRISTAL.texto, children, ...resto }: Texto3DProps) {
    return (
        <Text {...resto} color={color} fontSize={tamanoTextoMinimo(distancia, grados)}>
            {children}
        </Text>
    );
}
