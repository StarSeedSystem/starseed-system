"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { crearSonidos, leerPreferenciaSonido, type Sonidos } from "@/lib/vivo/juegos/sonidos";

/** Sonidos de la sala: silenciados por defecto; la preferencia se recuerda en este navegador. */
export function useSonidos(): { sonidos: Sonidos; activo: boolean; alternar: () => void } {
    const ref = useRef<Sonidos | null>(null);
    if (!ref.current) ref.current = crearSonidos(false);
    const [activo, setActivo] = useState(false);

    useEffect(() => {
        const s = ref.current;
        if (!s) return;
        if (leerPreferenciaSonido()) {
            s.fijar(true);
            setActivo(true);
        }
        return () => s.cerrar();
    }, []);

    const alternar = useCallback(() => {
        const s = ref.current;
        if (!s) return;
        const nuevo = !s.activo();
        s.fijar(nuevo);
        setActivo(nuevo);
        if (nuevo) s.tocar("ficha");
    }, []);

    return { sonidos: ref.current, activo, alternar };
}
