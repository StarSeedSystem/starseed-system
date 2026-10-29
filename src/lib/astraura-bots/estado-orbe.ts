/**
 * ESTADO DE LA ORBE DEL BOT (DAN1024D · Ola 1024D)
 * ─────────────────────────────────────────────────
 * Módulo PURO: traduce la fase del bucle del bot (BOT1011) al `EstadoOrbe` de
 * la identidad dinámica (`src/lib/design/animaciones-orbe.ts`), sin red, disco
 * ni reloj. La orbe de un bot hermana respira así:
 *   · escucha  — fase «observando»: los sentidos están abiertos.
 *   · piensa   — fase «esperando»: el bot aguarta el visto bueno de una persona.
 *   · habla    — fase «actuando»: el bot está ejecutando su propuesta.
 *   · reposo   — sin bucle, en reposo, hecho o rechazado.
 */

import type { EstadoOrbe } from "@/lib/design/animaciones-orbe";
import type { EstadoBucle } from "./bucle";

/** Estado de la orbe que corresponde a la fase del bucle del bot. */
export function estadoOrbeDeBucle(b?: EstadoBucle): EstadoOrbe {
    if (!b || b.fase === "reposo" || b.fase === "hecho" || b.fase === "rechazado") return "reposo";
    if (b.fase === "observando") return "escucha";
    if (b.fase === "esperando") return "piensa";
    return "habla";
}
