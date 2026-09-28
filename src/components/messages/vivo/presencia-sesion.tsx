"use client";

/**
 * PresenciaSesionVivaMontaje — anuncia en el canal `vivo:<id>` que esta pestaña está DENTRO de
 * una app en vivo. Las apps (pizarra, escritorio…) no saben nada de sesiones: la tarjeta las abre
 * con `?sesion=<id>` y este montaje global lo lee de la URL. Así el «N personas dentro» de la
 * tarjeta cuenta a quien de verdad está en la app, no a quien mira el chat.
 *
 * Se monta UNA vez (layout raíz). Sin `?sesion=` válido no abre ningún canal.
 *
 * El canal es PRIVADO (2026-09-28): el servidor solo deja anunciarse al creador, a los invitados,
 * a los miembros del chat y, mientras haya enlace público, a quien traiga su token (`?t=`). Sin
 * permiso no se anuncia (y no se reintenta en bucle).
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { esUuid, usePresenciaEnSesion } from "@/lib/mensajeria/sesiones-vivas";

function Anunciar() {
    const params = useSearchParams();
    const sesion = params?.get("sesion") ?? null;
    const token = params?.get("t") ?? null;
    usePresenciaEnSesion(esUuid(sesion) ? sesion : null, token);
    return null;
}

export function PresenciaSesionVivaMontaje() {
    return (
        <Suspense fallback={null}>
            <Anunciar />
        </Suspense>
    );
}

export default PresenciaSesionVivaMontaje;
