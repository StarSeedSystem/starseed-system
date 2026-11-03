"use client";

/**
 * StarSeed XR · COMODIDAD MONTADA (XR1010F · contrato §3 j). El enlace entre `<Comodidad>` y la
 * escena: construye el contexto de acciones con lo que YA existe («salir» cierra la sesión del
 * almacén; el giro por saltos lo pone el propio `Comodidad`) y lo monta en la escena de `/xr/os`.
 * El cableado final completo (recentrar, hablar, menú de mano, frases de Astraura y de la
 * transmisión al subtítulo) queda PENDIENTE-DE: XR1010AS, el montaje del enjambre.
 */
import { useMemo } from "react";
import type { Object3D } from "three";
import type { XRStore } from "@react-three/xr";
import type { ModoXR } from "@/lib/xr/tipos";
import type { ContextoAcciones } from "./acciones-xr";
import { Comodidad } from "./comodidad";

/** Lo mínimo que hace falta del almacén para cerrar la sesión; evita acoplar a la librería entera. */
interface AlmacenSesion { getState(): { session?: { end(): Promise<void> } | null } | null | undefined }
export type SalidaSesion = () => Promise<void>;

/** «Salir» real: cierra la sesión WebXR si la hay; si ya se cerró, no falla. */
export const salidaDe = (almacen: AlmacenSesion | null): SalidaSesion => async () => {
    try { await almacen?.getState()?.session?.end(); } catch { /* la sesión ya estaba cerrada */ }
};

/**
 * Contexto provisional por encima de lo que la escena ya tiene: `salir` cierra la sesión;
 * el resto queda sin efecto hasta que XR1010AS entregue el contexto real (nada se pinta con él,
 * solo alimenta la entrada; la viñeta, el aviso y el giro por saltos ya funcionan).
 */
export function ctxComodidad(salir: SalidaSesion): ContextoAcciones {
    const nada = () => undefined;
    return {
        recentrar: nada, salir, abrirMenuMano: nada, abrirDock: nada,
        hablar: nada, atras: nada, seleccionar: nada, agarrar: nada,
        teletransporte: nada, girar: nada,
    };
}

export interface PropsComodidadMontado {
    modo: ModoXR;
    /** El almacén de la sesión, para la acción `salir`. */
    almacen?: XRStore | null;
    /** El grupo del rig (el `<XROrigin>` de la escena); si falta, el «Comodidad» usa el padre de la cámara. */
    riga?: Object3D | null;
    /** Altura de ojos medida por el visor (XR1010G); 1,7 m si aún no se midió. */
    alturaOjos?: number;
    /** Lo que dice Astraura y lo que se oye de la transmisión; XR1010AS las alimenta. */
    fraseAstraura?: string | null;
    textoTransmision?: string | null;
}

export function ComodidadMontado({ modo, almacen = null, riga = null, alturaOjos = 1.6, fraseAstraura = null, textoTransmision = null }: PropsComodidadMontado) {
    const ctx = useMemo(() => ctxComodidad(salidaDe(almacen)), [almacen]);
    return <Comodidad modo={modo} ctx={ctx} riga={riga} alturaOjos={alturaOjos} fraseAstraura={fraseAstraura} textoTransmision={textoTransmision} />;
}
