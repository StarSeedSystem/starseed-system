/**
 * CTL1117B · las palabras del medio de transmisión del control, en español llano (misma convención que `palabras.ts`:
 * una función o tabla por cosa, nada de códigos en la cara de la persona).
 */

import type { MedioElegido, MedioReal, TipoMedio, EfectoPantalla } from "./medio";

export const NOMBRE_ELECCION: Readonly<Record<MedioElegido, string>> = {
    auto: "Automático",
    bluetooth: "Solo Bluetooth",
    "wifi-directo": "Wi‑Fi directo",
    "wifi-router": "Wi‑Fi por router (red local)",
    malla: "Malla (varios medios a la vez)",
    nodos: "Por nodos o servidor StarSeed",
};

export const AYUDA_ELECCION: Readonly<Record<MedioElegido, string>> = {
    auto: "Se usa el camino más directo que haya, y cambia solo si deja de servir.",
    bluetooth: "Las órdenes solo van por Bluetooth directo entre los dos aparatos.",
    "wifi-directo": "Solo por el enlace Wi‑Fi directo entre los dos aparatos, sin router.",
    "wifi-router": "Solo por la red local, a través del router.",
    malla: "Reparte las órdenes entre todos los caminos directos que haya a la vez, como las videollamadas.",
    nodos: "Por otras neuronas de tu cuenta que hacen de nodo de relevo; la pantalla, por el servidor de retransmisión.",
};

const NOMBRE_TIPO: Readonly<Record<TipoMedio, string>> = {
    bluetooth: "Bluetooth",
    "wifi-directo": "Wi‑Fi directo",
    "red-local": "Wi‑Fi de la red local (router)",
    internet: "internet",
    nodo: "nodo de relevo",
    turn: "servidor de retransmisión",
    servidor: "servidor StarSeed",
    lora: "radio LoRa",
};

/** «Directo · Bluetooth», «Por capa · nodo de relevo», «sin determinar». */
export function textoMedioReal(r: MedioReal): string {
    if (r.camino === "sin-determinar") return "sin determinar";
    const cabeza = r.camino === "capa" ? "Por capa" : "Directo";
    const medio = r.medio ? NOMBRE_TIPO[r.medio] : "ruta sin medir";
    return `${cabeza} · ${medio}${r.nota && r.medio ? ` (${r.nota})` : ""}`;
}

export function textoPantallaElegida(e: MedioElegido, efecto: EfectoPantalla): string | null {
    if (e === "auto") return null;
    if (efecto === "forzada") return e === "malla" ? "La pantalla va por un solo camino a la vez: evita los servidores, pero aún no se reparte entre varios medios." : null;
    return "Aún no disponible para la pantalla: el vídeo sigue por el camino automático.";
}

export const PALABRA_MEDIO_PERDIDO = "El medio elegido ya no está disponible. El control no cambia de medio por su cuenta.";
export const BOTON_PASAR_A_AUTO = "Pasar a Automático";
export const AVISO_RECONECTA = "La pantalla se vuelve a conectar para usar ese medio.";
export const MOTIVO_MEDIO_NO_DISPONIBLE = "El medio elegido para este aparato no está disponible ahora. Elige otro medio o pasa a Automático.";
export const NOTA_RESPUESTAS = "Las respuestas del otro aparato vuelven por el camino que ese aparato elija.";
