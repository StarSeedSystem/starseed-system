"use client";

/**
 * StarSeed XR · DOCK CURVO 3D (XR1010M · contrato §3 a y b) — nodo Anchor.
 * Lee LAS MISMAS apps que el dock 2D (`loadDockConfig`) y escucha `starseed.dock.items.v2`.
 * El icono es la inicial del nombre dentro de un círculo: es lo más simple y barato; los SVG de
 * `DOCK_ICON_MAP` son componentes de React y convertirlos a `Svg` de uikit añade peso sin valor.
 * Pulsar: nativa-3d abre su panel (`abrir`); solo-2d enseña el motivo y sale a 2D (`alSalir2D`).
 */
import { useEffect, useMemo, useState } from "react";
import { Container, Text } from "@react-three/uikit";
import { DOCK_STORAGE_KEY } from "@/lib/dock/dock-defaults";
import { loadDockConfig, type DockColor, type DockItemConfig } from "@/components/layout/dock-config";
import { COLORES_NODO, CRISTAL, type NodoCardinal } from "../../../lib/xr/tokens-3d";
import { OBJETIVO_MIN_TACTO_M, posicionesDock, type EntradaEspacio } from "../../../lib/xr/espacio-trinity";
import type { NivelCalidad, Vec3 } from "../../../lib/xr/tipos";
import { Animado } from "./animado";
import { PanelCristal, Texto3D } from "./panel-cristal";
import { itemsDelDock, resolverApp } from "./apps-3d";

/** Lado del botón: 9 cm, holgado sobre el mínimo de 3 cm para tocar con el dedo. */
const LADO_BOTON_M = Math.max(OBJETIVO_MIN_TACTO_M, 0.09);

/** DockColor → nodo de `tokens-3d.ts`; ningún color se escribe a mano. */
const NODO_POR_COLOR: Record<DockColor, NodoCardinal> = {
    neutral: "logic", cyan: "zenith", crimson: "anchor", amber: "logic", emerald: "horizon", purple: "horizon",
};
const ACENTO_POR_COLOR: Record<DockColor, string> = {
    neutral: CRISTAL.textoSecundario, cyan: COLORES_NODO.zenith.base, crimson: COLORES_NODO.anchor.base,
    amber: COLORES_NODO.logic.base, emerald: COLORES_NODO.horizon.base, purple: COLORES_NODO.horizon.vivo,
};

export interface PropsDock3D {
    entrada: EntradaEspacio;
    /** `nativa-3d`: abre su panel en Horizon o Logic. */
    abrir: (id: string) => void;
    /** Termina la sesión XR y navega a la ruta en 2D. */
    alSalir2D: (ruta: string) => void;
    nivel?: NivelCalidad;
    /** Solo para pruebas o para inyectar la config ya cargada. */
    configInicial?: DockItemConfig[];
}

interface PropsBoton {
    etiqueta: string; color: DockColor; i: number; n: number;
    posicion: Vec3; yaw: number; distancia: number; nivel?: NivelCalidad;
    alPulsar: () => void;
}
