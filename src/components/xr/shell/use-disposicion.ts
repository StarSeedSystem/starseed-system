"use client";

/**
 * StarSeed XR · DISPOSICIÓN DE LA TRINITY (XR1010J · contrato §3 a). Lee del confort la
 * postura, la mano dominante, la escala y la altura de los ojos (manual si la hay; si no,
 * la medida del visor de XR1010G) y la calcula con `disponerTrinity` del núcleo puro.
 * La disposición SOLO se recalcula al recentrar: con «recentrar()» (acción o voz
 * «recentra»), o cuando `debeRecentrar` lo pide —evaluado a 2 Hz, nunca por fotograma—,
 * o cuando cambia el confort. La partida pura vive aquí para probarse sin React.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    debeRecentrar,
    disponerTrinity,
    type DisposicionTrinity,
} from "../../../lib/xr/espacio-trinity";
import type { Mano, ModoXR, Postura } from "../../../lib/xr/tipos";
import { aRadianes } from "../../../lib/xr/tipos";
import { usePrefsXR } from "./use-prefs-xr";

export interface EstadoBase {
    yawBase: number;
    fueraDesde: number | null;
}

const UMBRAL = aRadianes(70);
const SEGUNDOS_FUERA = 3;

/**
 * Siguiente estado de la base, partida pura del hook. La diferencia de yaw se mide en el
 * círculo (−π..π), así que pasar de 170° a −170° no se cree un salto de 340°. Mirar dentro
 * del umbral devuelve el ESTADO MISMO cuando no había cronómetro (no hay recalculo). Con
 * `orden` de «recentrar» —acción del menú o voz «recentra»— se centra ya, sin esperar.
 */
export function siguienteBase(
    estado: EstadoBase,
    cabeza: { yaw: number },
    ahora: number,
    orden?: "recentrar",
): EstadoBase {
    if (orden === "recentrar") return { yawBase: cabeza.yaw, fueraDesde: null };
    const dif = Math.abs(Math.atan2(Math.sin(cabeza.yaw - estado.yawBase), Math.cos(cabeza.yaw - estado.yawBase)));
    if (dif <= UMBRAL) {
        return estado.fueraDesde === null ? estado : { yawBase: estado.yawBase, fueraDesde: null };
    }
    const desde = estado.fueraDesde ?? ahora;
    return debeRecentrar(cabeza.yaw, estado.yawBase, ahora - desde)
        ? { yawBase: cabeza.yaw, fueraDesde: null }
        : { yawBase: estado.yawBase, fueraDesde: desde };
}

/** La altura fijada a mano manda sobre la medida del visor; sin ninguna, la de defecto. */
export function alturaOjosEfectiva(manual: number | null, medida?: number): number {
    if (manual !== null) return manual;
    if (medida !== undefined) return medida;
    return 1.6;
}

export interface ConfigDisposicion {
    /** Por defecto, pantalla en 3D; el visor lo pide con su modo inmersivo. */
    modo?: ModoXR;
    alturaOjosMedida?: number;
    yawCabeza?: { current: number };
}

export interface ResultadoDisposicion {
    disposicion: DisposicionTrinity;
    recentrar: () => void;
    postura: Postura;
    mano: Mano;
}

/**
 * Lee el confort, sondea `debeRecentrar` a 2 Hz (500 ms) con el yaw de la cabeza que la
 * escena mantiene en `yawCabeza.current` y recalcula la disposición SOLO cuando cambia la
 * base o el confort. `recentrar()` es la acción que comparte el menú de mano (XR1010N) y
 * la voz «recentra» (intenciones).
 */
export function useDisposicionTrinity({
    modo = "3d-pantalla",
    alturaOjosMedida,
    yawCabeza,
}: ConfigDisposicion = {}): ResultadoDisposicion {
    const { confort } = usePrefsXR();
    const [estado, setEstado] = useState<EstadoBase>(() => ({ yawBase: 0, fueraDesde: null }));
    const recentrar = useCallback(() => {
        setEstado((prev) => siguienteBase(prev, { yaw: yawCabeza?.current ?? prev.yawBase }, Date.now() / 1000, "recentrar"));
    }, [yawCabeza]);
    useEffect(() => {
        const reloj = setInterval(() => {
            setEstado((prev) => siguienteBase(prev, { yaw: yawCabeza?.current ?? prev.yawBase }, Date.now() / 1000));
        }, 500);
        return () => window.clearInterval(reloj);
    }, [yawCabeza]);
    const disposicion = useMemo(
        () =>
            disponerTrinity({
                alturaOjos: alturaOjosEfectiva(confort.alturaOjos, alturaOjosMedida),
                postura: confort.postura,
                manoDominante: confort.manoDominante,
                modo,
                escala: confort.escala,
                yawBase: estado.yawBase,
            }),
        [
            confort.alturaOjos, confort.postura, confort.manoDominante, confort.escala,
            modo, alturaOjosMedida, estado.yawBase,
        ],
    );
    return { disposicion, recentrar, postura: confort.postura, mano: disposicion.mano };
}
