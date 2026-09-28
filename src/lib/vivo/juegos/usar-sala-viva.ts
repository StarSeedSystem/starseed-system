"use client";

/**
 * Hook React de una sala viva (juego o programa): crea el controlador real (Supabase), lo inicia,
 * lo expone con `useSyncExternalStore` y se ocupa del ciclo de vida:
 *   · guarda al esconder la pestaña o al cerrarla, relee al volver o al recuperar la red;
 *   · cierra el canal y la suscripción al salir (presupuesto de tráfico).
 * `getSnapshot` es SIEMPRE el mismo objeto mientras nada cambia (`INSTANTANEA_VACIA` antes de
 * tener controlador), para que React no entre en bucle.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { INSTANTANEA_VACIA, type Controlador, type Instantanea } from "./controlador";
import { crearControladorSupabase } from "./transporte-supabase";
import type { BuscarMotor } from "./registro";

const sinSuscripcion = () => () => {};
const instantaneaVacia = (): Instantanea => INSTANTANEA_VACIA;

export interface SalaViva {
    controlador: Controlador | null;
    instantanea: Instantanea;
    reintentar: () => void;
}

export function useSalaViva(spaceId: string | null, tipoDoc: "juego" | "programa", buscarMotor: BuscarMotor): SalaViva {
    const [controlador, setControlador] = useState<Controlador | null>(null);
    const [intento, setIntento] = useState(0);

    useEffect(() => {
        if (!spaceId) return;
        let vivo = true;
        let creado: Controlador | null = null;
        void crearControladorSupabase({ spaceId, tipoDoc, buscarMotor }).then((c) => {
            if (!vivo) {
                c.cerrar();
                return;
            }
            creado = c;
            setControlador(c);
            void c.iniciar();
        });
        return () => {
            vivo = false;
            setControlador(null);
            creado?.cerrar();
        };
        // buscarMotor es una función estable de módulo; no es una dependencia reactiva.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spaceId, tipoDoc, intento]);

    useEffect(() => {
        if (!controlador || typeof document === "undefined") return;
        const alVisibilidad = () => {
            if (document.visibilityState === "hidden") controlador.vaciarCola();
            else void controlador.refrescar();
        };
        const alSalir = () => controlador.vaciarCola();
        const alVolverLaRed = () => void controlador.refrescar();
        document.addEventListener("visibilitychange", alVisibilidad);
        window.addEventListener("pagehide", alSalir);
        window.addEventListener("online", alVolverLaRed);
        return () => {
            document.removeEventListener("visibilitychange", alVisibilidad);
            window.removeEventListener("pagehide", alSalir);
            window.removeEventListener("online", alVolverLaRed);
        };
    }, [controlador]);

    const instantanea = useSyncExternalStore(
        controlador ? controlador.subscribe : sinSuscripcion,
        controlador ? controlador.getSnapshot : instantaneaVacia,
        instantaneaVacia,
    );

    const reintentar = useCallback(() => setIntento((n) => n + 1), []);
    return { controlador, instantanea, reintentar };
}
