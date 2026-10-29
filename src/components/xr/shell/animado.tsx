"use client";

/**
 * StarSeed XR · ANIMADO (XR1010I · contrato §3 b).
 * Envuelve a sus hijos en un `group` R3F y los anima al montar. Con `salir` hace la salida y avisa
 * para que el padre desmonte; un `evento` cambiante (foco/desfoco) re-lanza desde el estado actual
 * sin saltar. Sin setState por fotograma: el hook muta el grupo y sus materiales.
 */
import type { ReactNode } from "react";
import type { Group } from "three";
import type { NivelCalidad } from "../../../lib/xr/tipos";
import type { EstiloTransicion, EventoTransicion } from "../../../lib/xr/transiciones";
import { useTransicion } from "./use-transicion";

export interface PropsAnimado {
    evento?: EventoTransicion;
    hermano?: { i: number; n: number };
    estilo?: EstiloTransicion;
    nivel?: NivelCalidad;
    distancia?: number;
    movimientoReducido?: boolean;
    /** Cuando pasa a `true`, hace «salida» y llama a `alTerminar` al acabar. */
    salir?: boolean;
    alTerminar?: () => void;
    children?: ReactNode;
}

export function Animado({
    evento = "entrada",
    hermano,
    estilo,
    nivel,
    distancia,
    movimientoReducido,
    salir = false,
    alTerminar,
    children,
}: PropsAnimado) {
    const { grupo } = useTransicion<Group>(salir ? "salida" : evento, {
        estilo,
        nivel,
        hermano,
        distancia,
        movimientoReducido,
        alTerminar: salir ? alTerminar : undefined,
    });
    return <group ref={grupo}>{children}</group>;
}
