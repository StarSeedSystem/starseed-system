"use client";

import { useCallback, useEffect, useState } from "react";

import { guardarEstado, leerEstado } from "./asignaciones";
import { CLAVE_RECURSOS_IA, EVENTO_RECURSOS_IA, type EstadoRecursosIa } from "./tipos";

/** Estado de recursos de IA en vivo (se actualiza al cambiar en esta pestaña, en otra o al llegar de la cuenta). */
export function useRecursosIa(): [EstadoRecursosIa, (cambio: (e: EstadoRecursosIa) => EstadoRecursosIa) => void] {
    const [estado, setEstado] = useState<EstadoRecursosIa>(() => leerEstado());
    useEffect(() => {
        const releer = () => setEstado(leerEstado());
        const almacen = (ev: StorageEvent) => {
            if (ev.key === CLAVE_RECURSOS_IA) releer();
        };
        window.addEventListener(EVENTO_RECURSOS_IA, releer);
        window.addEventListener("storage", almacen);
        return () => {
            window.removeEventListener(EVENTO_RECURSOS_IA, releer);
            window.removeEventListener("storage", almacen);
        };
    }, []);
    const cambiar = useCallback((cambio: (e: EstadoRecursosIa) => EstadoRecursosIa) => {
        const nuevo = cambio(leerEstado());
        guardarEstado(nuevo);
        setEstado(nuevo);
    }, []);
    return [estado, cambiar];
}
