/**
 * Control entre mis neuronas · el gancho de React de la pantalla remota (PAN1115J).
 *
 * `usarPantallaRemota(neurona)` abre la sesión al montarse y la cierra al desmontarse (o al cambiar de
 * neurona). Devuelve lo que la ventana de control espera (costura 3) más `enviar`, `cerrar` y `reintentar`.
 * Con `neurona` null no hace nada (estado «cerrada»).
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FUENTE_DEFECTO, type FuentePedida, veredictoFuente, type VeredictoFuente } from "./fuente-pantalla";
import { crearPantallaDestino, type EntradaControl, type InstantaneaPantalla, type PantallaDestino } from "./pantalla-destino";
import { type AjustesSesion, AJUSTES_DEFECTO, serializarAjustes, sonIguales } from "./ajustes-sesion";

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
    /** RST1116A: la fuente que se pidió (nunca la que se obtuvo). */
    fuentePedida: FuentePedida;
    /** RST1116A: veredicto de si se cumplió lo pedido. */
    veredicto: VeredictoFuente;
}

/** `fuente` (RST1116A): la pantalla que pide la persona; sin ella, «auto» (como siempre). Cambiarla reabre la pantalla. */
export function usarPantallaRemota(
    neurona: string | null,
    opciones?: { fuente?: FuentePedida; ajustes?: AjustesSesion },
): PantallaRemota {
    const fuentePedida = opciones?.fuente ?? FUENTE_DEFECTO;
    const ajustes = opciones?.ajustes ?? AJUSTES_DEFECTO;
    // CTL1124D: la dependencia es el VALOR, no la identidad. Al cargar los ajustes guardados el objeto
    // cambia una vez aunque valga lo mismo; antes eso cerraba la sesión y la reabría (y el aparato se
    // quedaba sin capturar). Se reabre solo si de verdad cambian los ajustes.
    const claveAjustes = serializarAjustes(ajustes);
    const [intento, setIntento] = useState(0);
    const [obj, setObj] = useState<PantallaDestino | null>(null);
    const prevFuentePedidaRef = useRef(fuentePedida);
    const currentFuentePedidaRef = useRef(fuentePedida);
    currentFuentePedidaRef.current = fuentePedida;
    const prevAjustesRef = useRef(ajustes);
    const currentAjustesRef = useRef(ajustes);
    currentAjustesRef.current = ajustes;

    useEffect(() => {
        const prevFuentePedida = prevFuentePedidaRef.current;
        const prevAjustes = prevAjustesRef.current;
        prevFuentePedidaRef.current = fuentePedida;
        prevAjustesRef.current = ajustes;

        if (!neurona) {
            setObj(null);
            return;
        }
        const p = crearPantallaDestino(neurona, { fuente: fuentePedida, ajustes: currentAjustesRef.current });
        setObj(p);
        void p.iniciar();
        return () => {
            const fuenteCambiada = prevFuentePedida !== currentFuentePedidaRef.current;
            const ajustesCambiados = prevAjustes !== currentAjustesRef.current && !sonIguales(prevAjustes, currentAjustesRef.current);
            const motivo = fuenteCambiada ? "fuente-cambiada" : ajustesCambiados ? "ajustes-cambiados" : "desmontada";
            void p.cerrar(motivo, true);
        };
    }, [neurona, intento, fuentePedida, claveAjustes]);

    const suscribir = useCallback((cb: () => void) => (obj ? obj.suscribir(cb) : () => undefined), [obj]);
    const snap = useSyncExternalStore(
        suscribir,
        () => (obj ? obj.instantanea() : VACIA),
        () => VACIA,
    );
    const enviar = useCallback((e: EntradaControl) => obj?.enviar(e) ?? false, [obj]);
    const cerrar = useCallback(() => void obj?.cerrar("cerrada-por-la-persona", true), [obj]);
    const reintentar = useCallback(() => setIntento((n) => n + 1), []);
    const pedirFluida = useCallback(() => obj?.pedirFluida() ?? Promise.resolve(false), [obj]);
    const veredicto = veredictoFuente(fuentePedida, snap.fuente ?? null);
    return useMemo(
        () => ({ ...snap, enviar, cerrar, reintentar, pedirFluida, fuentePedida, veredicto }),
        [snap, enviar, cerrar, reintentar, pedirFluida, fuentePedida, veredicto],
    );
}
