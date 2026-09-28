"use client";

import { useEffect } from "react";
import type { Controlador, Instantanea } from "@/lib/vivo/juegos/controlador";
import { baseCompactada, convieneCompactar, TIPO_REGISTRO_PROGRAMA } from "@/lib/vivo/programas/motor";
import type { EstadoPrograma } from "@/lib/vivo/programas/tipos";

/**
 * Pliega el diario cuando crece (un contador con miles de clics no puede llegar al tope de
 * entradas). Solo lo hace quien puede escribir, tras una espera al azar para que no compacten
 * todas las personas a la vez; y solo si nadie lo ha hecho ya cuando toca. El nuevo registro
 * CONTINÚA al anterior (`continuidad`): lo que alguien tuviera sin guardar se conserva.
 */
export function useCompactacion(controlador: Controlador | null, inst: Instantanea, activo: boolean): void {
    const registro = inst.registro;
    const rid = registro?.id ?? null;
    const gen = registro?.gen ?? null;
    const toca = inst.fase === "listo" && convieneCompactar(registro);

    useEffect(() => {
        if (!controlador || !activo || !toca || rid === null) return;
        const espera = 200 + Math.floor(Math.random() * 1500);
        const id = setTimeout(() => {
            const foto = controlador.getSnapshot();
            const actual = foto.registro;
            const estado = foto.estado as EstadoPrograma | null;
            if (!actual || !estado || foto.soloLectura) return;
            if (actual.id !== rid || actual.gen !== gen || !convieneCompactar(actual)) return;
            controlador.nuevoRegistro(TIPO_REGISTRO_PROGRAMA, baseCompactada(estado, actual), { continuidad: true });
        }, espera);
        return () => clearTimeout(id);
    }, [controlador, activo, toca, rid, gen]);
}
