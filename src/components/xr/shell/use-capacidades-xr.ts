"use client";

/**
 * StarSeed XR · `useCapacidadesXR` (XR1010Bc). Sondea el navegador una vez al montar, vuelve a sondear cuando se
 * enchufa o se quita un visor (`devicechange`) y calcula `capacidades` y `plan` con el núcleo puro.
 *
 * - El estado inicial es el mismo en servidor y cliente (`DATOS_SIN_SONDEO`): no hay desajuste de hidratación.
 * - `datos`, `capacidades` y `plan` NUNCA son `null`. Mientras `estado === "sondeando"` el plan es PROVISIONAL
 *   («solo-pantalla»): el botón de entrada (XR1010E) debe mirar `estado` antes de afirmar «este aparato no tiene VR».
 * - Cambiar `modo` o `contexto` recalcula, no vuelve a sondear. Una respuesta tardía de un sondeo anterior se descarta.
 */
import { useEffect, useMemo, useState } from "react";
import { evaluarCapacidades, planificarEntrada } from "@/lib/xr/capacidades";
import type { CapacidadesXR, ContextoEntrada, DatosNavegador, PlanEntrada } from "@/lib/xr/capacidades";
import type { ModoXR } from "@/lib/xr/tipos";
import { DATOS_SIN_SONDEO, escucharDispositivosXR, sondearNavegador } from "./sondeo-navegador";

export interface OpcionesCapacidadesXR {
    modo?: ModoXR | "auto";
    contexto?: ContextoEntrada;
}

export interface ResultadoCapacidadesXR {
    estado: "sondeando" | "listo";
    datos: DatosNavegador;
    capacidades: CapacidadesXR;
    plan: PlanEntrada;
}

interface Sondeo {
    estado: ResultadoCapacidadesXR["estado"];
    datos: DatosNavegador;
}

const INICIAL: Sondeo = { estado: "sondeando", datos: DATOS_SIN_SONDEO };

export function useCapacidadesXR(opciones: OpcionesCapacidadesXR = {}): ResultadoCapacidadesXR {
    const { modo, contexto } = opciones;
    const [sondeo, setSondeo] = useState<Sondeo>(INICIAL);

    useEffect(() => {
        let vivo = true;
        let turno = 0;
        const sondear = () => {
            const mio = ++turno;
            const guardar = (datos: DatosNavegador) => { if (vivo && mio === turno) setSondeo({ estado: "listo", datos }); };
            sondearNavegador().then(guardar, () => guardar(DATOS_SIN_SONDEO));
        };
        sondear();
        const dejarDeEscuchar = escucharDispositivosXR(sondear);
        return () => { vivo = false; dejarDeEscuchar(); };
    }, []);

    const { estado, datos } = sondeo;
    return useMemo(() => {
        const capacidades = evaluarCapacidades(datos, { modo, contexto });
        return { estado, datos, capacidades, plan: planificarEntrada(capacidades, { instalada: datos.instalada }) };
    }, [estado, datos, modo, contexto]);
}
