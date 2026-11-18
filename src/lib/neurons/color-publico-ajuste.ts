/**
 * CTL1117I · dónde vive el color público de cada neurona. Dentro de sus ajustes (`NeuronSettings.colorPublico`, en
 * `starseed.neurons.prefs.v1`, que ya viaja con la cuenta): sin migración y sin tocar la base de datos. Si no hay dato (o no
 * vale) se usa el de su id (`colorPorDefecto`), así las instalaciones que ya existen siguen igual.
 * Se publica con el resto de lo público de la neurona: `col` en su presencia (`lib/neurons/presencia.ts`).
 */

import { colorDe, colorValido, normalizarColor } from "./color-publico";
import { setNeuronSettings, settingsFor, thisDeviceId } from "./neurons";

/** El color de la neurona `id`: el que eligió su dueño, o el suyo por defecto. Nunca lanza. */
export function colorPublicoDeNeurona(id: string, anunciado?: unknown): string {
    if (colorValido(anunciado)) return anunciado;
    try {
        return colorDe(id, settingsFor(id).colorPublico);
    } catch {
        return colorDe(id);
    }
}

/** El color de ESTA neurona (el que firma el controlador). */
export function colorPublicoPropio(): string {
    let id = "";
    try {
        id = thisDeviceId();
    } catch {
        id = "";
    }
    return colorPublicoDeNeurona(id);
}

/** Fija el color de una neurona (`null` = volver al de por defecto). Devuelve el color que queda o null si lo escrito no vale. */
export function ponerColorPublico(id: string, color: string | null): string | null {
    if (color === null) {
        setNeuronSettings(id, { colorPublico: undefined });
        return colorPublicoDeNeurona(id);
    }
    const c = normalizarColor(color);
    if (!c) return null;
    setNeuronSettings(id, { colorPublico: c });
    return c;
}
