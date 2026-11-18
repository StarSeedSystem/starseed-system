/**
 * Control entre mis neuronas · el gancho de React de la pantalla remota (PAN1115J).
 *
 * `usarPantallaRemota(neurona)` abre la sesión al montarse y la cierra al desmontarse (o al cambiar de
 * neurona). Devuelve lo que la ventana de control espera (costura 3) más `enviar`, `cerrar` y `reintentar`.
 * Con `neurona` null no hace nada (estado «cerrada»).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { FUENTE_DEFECTO, type FuentePedida, veredictoFuente, type VeredictoFuente } from "./fuente-pantalla";
import { crearPantallaDestino, type EntradaControl, type InstantaneaPantalla, type PantallaDestino } from "./pantalla-destino";

const VACIA: InstantaneaPantalla = {
    estado: "cerrada",
    motivo: "sin-neurona",
    desde: 0,
    flujo: null,
    pantalla: null,
    nivel: "ver",
    capacidades: { gestos: false, maxDedos: 0, teclas: [], volumen: false, brillo: false, texto: false },
    aparato: null,
};

export interface PantallaRemota extends InstantaneaPantalla {
    enviar: (e: EntradaControl) => boolean;
    cerrar: () => void;
    reintentar: () => void;
    /** CTL1118F: la persona pide la pantalla fluida con la sesión en marcha (no reabre nada). */
    pedirFluida: () => Promise<boolean>;
    /** RST1116A: la fuente que se pidió (la que decide la persona). */
    fuentePedida: FuentePedida;
    /** RST1116A: veredicto de si se cumplió la petición comparando con la fuente real del aparato. */
    veredicto: VeredictoFuente;
}

/** `fuente` (RST1116A): la pantalla que pide la persona; sin ella, «auto» (como siempre). Cambiarla reabre la pantalla. */
export function usarPantallaRemota(
    neurona: string | null,
    opciones?: { fuente?: FuentePedida } | FuentePedida
): PantallaRemota {
    const fuentePedida = (typeof opciones === "string" ? opciones : opciones?.fuente) ?? FUENTE_DEFECTO;
    const [intento, setIntento] = useState(0);
    const [obj, setObj] = useState<PantallaDestino | null>(null);

    useEffect(() => {
        if (!neurona) {
            setObj(null);
            return;
        }
        const p = crearPantallaDestino(neurona, { fuente: fuentePedida });
        setObj(p);
        void p.iniciar();
        return () => {
            void p.cerrar("desmontada", true);
        };
    }, [neurona, intento, fuentePedida]);

    const suscribir = useCallback((cb: () => void) => (obj ? obj.suscribir(cb) : () => undefined), [obj]);
    const snap = useSyncExternalStore(
        suscribir,
        () => (obj ? obj.instantanea() : VACIA),
        () => VACIA,
    );
    const veredicto = veredictoFuente(fuentePedida, snap.fuente ?? null);
    const enviar = useCallback((e: EntradaControl) => obj?.enviar(e) ?? false, [obj]);
    const cerrar = useCallback(() => void obj?.cerrar("cerrada-por-la-persona", true), [obj]);
    const reintentar = useCallback(() => setIntento((n) => n + 1), []);
    const pedirFluida = useCallback(() => obj?.pedirFluida() ?? Promise.resolve(false), [obj]);
    return useMemo(
        () => ({ ...snap, enviar, cerrar, reintentar, pedirFluida, fuentePedida, veredicto }),
        [snap, enviar, cerrar, reintentar, pedirFluida, fuentePedida, veredicto]
    );
}
