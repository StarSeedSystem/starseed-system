"use client";

/**
 * StarSeed XR · CONTENIDO MÍNIMO DE LA TRINITY (XR1010J · contrato §3 a). Rótulos de cada
 * cardinal mientras M–O y AG montan su contenido de verdad: un panel vacío no se pinta, y un
 * título solo no hace nada real, así que se dice «próximamente». `Texto3D` se carga perezoso
 * (uikit solo dentro del shell), igual que hace `PanelOS` en `escena-os.tsx`.
 */
import nextDynamic from "next/dynamic";
import type { NodoCardinal } from "../../../lib/xr/tokens-3d";
import type { ReactNode } from "react";

const Texto3D = nextDynamic(() => import("./panel-cristal").then((m) => m.Texto3D), { ssr: false });

/** Distancia generosa que cubre el peor caso (2,43 m en pantalla en 3D): el rótulo no baja nunca de 1°. */
const DISTANCIA_ROTULO = 2.5;

export const Rótulo = ({ texto }: { texto: string }): ReactNode => (
    <Texto3D distancia={DISTANCIA_ROTULO}>{texto}</Texto3D>
);

/** Rótulos por cardinal para pasar a `RigTrinity` como `contenido` mientras no llegue el suyo. */
export function rótulosTrinity(): Record<NodoCardinal, ReactNode> {
    return {
        zenith: <Rótulo texto="Astraura · próximamente" />,
        horizon: <Rótulo texto="Creación · próximamente" />,
        logic: <Rótulo texto="Control · próximamente" />,
        anchor: <Rótulo texto="Dock · próximamente" />,
    };
}
