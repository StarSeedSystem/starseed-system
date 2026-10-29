"use client";
/**
 * StarSeed XR · `<Animado>` (XR1010I · contrato §3 b). Cascarón fino de R3F: envuelve a sus hijos
 * en un `group` y delega TODO en `useTransicion`, que muta el objeto dentro de `useFrame`.
 * Anima al montar, re-lanza al cambiar `evento` (foco/desfoco) sin saltar, y con `salir` hace la
 * salida y avisa con `alTerminar` para que el padre lo desmonte.
 */
import { useRef, type ReactNode } from "react";
import type { Group } from "three";
import type { EstiloTransicion, EventoTransicion } from "../../../lib/xr/transiciones";
import { useTransicion, type HermanoTransicion } from "./use-transicion";

export interface PropsAnimado {
    children?: ReactNode;
    /** Evento de entrada/estado; por defecto `entrada`. */
    evento?: EventoTransicion;
    hermano?: HermanoTransicion;
    /** Si es true, hace `salida` y llama a `alTerminar` al acabar. */
    salir?: boolean;
    alTerminar?: () => void;
    estilo?: EstiloTransicion;
    /** Distancia de la persona al panel, en metros. */
    distancia?: number;
}

export function Animado({
    children,
    evento = "entrada",
    hermano,
    salir = false,
    alTerminar,
    estilo,
    distancia,
}: PropsAnimado) {
    const alTerminarRef = useRef(alTerminar);
    alTerminarRef.current = alTerminar;
    const { ref } = useTransicion<Group>(salir ? "salida" : evento, {
        estilo,
        hermano,
        distancia,
        alTerminar: salir ? () => alTerminarRef.current?.() : undefined,
    });
    return <group ref={ref}>{children}</group>;
}

export default Animado;
