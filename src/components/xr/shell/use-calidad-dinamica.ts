/* XR1010AE · use-calidad-dinamica.ts — hook de cliente que registra cada fotograma y, a 2 Hz,
   decide subir o bajar el nivel de calidad usando la histéresis del contrato §3 (d). */
"use client";

import { useEffect, useState } from "react";
import { crearMededor } from "./medidor-fotogramas";
import {
    siguienteCalidad,
    estadoInicialCalidad,
    CambioCalidad,
} from "@/lib/xr/calidad";
import { usePrefsXR } from "./use-prefs-xr";
import type { NivelCalidad } from "@/lib/xr/tipos";

export function useCalidadDinamica() {
    const { modo } = usePrefsXR().calidad; // "auto" | NivelCalidad
    const [nivel, setNivel] = useState<NivelCalidad>("minima");
    const [cambio, setCambio] = useState<CambioCalidad | null>(null);
    const [aviso, setAviso] = useState<string>("");

    const medidor = crearMededor();

    useEffect(() => {
        let ultimo = 0;
        const tick = (t: number) => {
            if (t - ultimo >= 500) {
                const p95 = medidor.p95();
                const presupuesto = medidor.presupuesto(60);
                const base = estadoInicialCalidad(nivel);
                const res = siguienteCalidad(base, { t, dt: p95 }, presupuesto, [60, 72, 90, 120]);
                if (res.cambio) {
                    setCambio(res.cambio);
                    setAviso(res.cambio.motivo);
                    if (res.cambio.tipo === "nivel") setNivel(res.cambio.a as NivelCalidad);
                }
                ultimo = t;
            }
            requestAnimationFrame(tick);
        };
        const id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [nivel, modo]);

    return { nivel, cambio, aviso };
}
// PENDIENTE-DE: XR1010AS