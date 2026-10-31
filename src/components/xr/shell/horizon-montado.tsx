"use client";
/**
 * StarSeed XR · MONTAJE DEL NODO HORIZON (XR1010AO · contrato `architecture/starseed-xr.md` §3 a y h).
 * Conecta lo que YA existía: `NodoHorizon` (el contenido probado) con la cuenta real
 * (`usuarioActual`) y las rutas que hoy existen (`rutaSalaXr`). Cascarón fino sin lógica nueva:
 * la confirmación de espacio público (XR1010X) y el resto de la navegación del nodo los cablea XR1010AS.
 */
import { useEffect, useState } from "react";
import { usuarioActual } from "@/lib/vivo/espacial/persistencia";
import { rutaSalaXr } from "@/lib/vivo/xr";
import type { ItemDestino } from "./destinos";
import { NodoHorizon } from "./nodo-horizon";

/** A dónde se va de verdad HOY desde un destino: tus mundos («mis-mundos») a su sala XR. */
export function rutaDeDestino(d: ItemDestino): string | null {
    if (d.categoria !== "mis-mundos") return null;
    return rutaSalaXr(d.id);
}

/** El nodo Horizon montado dentro del panel de la Trinity (lo pinta XR1010J en `escena-os.tsx`). */
export function HorizonMontado() {
    const [yo, setYo] = useState("");
    useEffect(() => {
        let vivo = true;
        void usuarioActual().then((u) => { if (vivo) setYo(u ?? ""); });
        return () => { vivo = false; };
    }, []);
    const alIr = (d: ItemDestino): void => {
        const ruta = rutaDeDestino(d);
        if (ruta) window.location.assign(ruta);
    };
    return <NodoHorizon yo={yo} alIr={alIr} />;
}

export default HorizonMontado;
