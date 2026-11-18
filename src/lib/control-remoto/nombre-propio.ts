/**
 * CTL1118G · el nombre de ESTA neurona tal como la persona se lo puso (el que ve en «Mensajes › Neuronas»), para que quien la
 * controla aparezca con ese nombre en el aparato controlado y no con la plataforma («MacIntel»).
 * Orden: el nombre de la neurona (`names[id]` de `starseed.neurons.prefs.v1`) → el nombre que le puso a este aparato → la plataforma.
 * Nunca lanza; sin nada devuelve «Neurona». Máximo 60 caracteres, sin controles.
 */

import { NEURON_PREFS_KEY, nombreEsteAparato, thisDeviceId } from "@/lib/neurons/neurons";

function limpio(v: unknown): string {
    if (typeof v !== "string") return "";
    return [...v.replace(/[\u0000-\u001f\u007f]/g, "")].slice(0, 60).join("").trim();
}

export function nombreNeuronaPropia(): string {
    try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem(NEURON_PREFS_KEY) : null;
        const names = (raw ? (JSON.parse(raw) as { names?: Record<string, unknown> }).names : undefined) ?? {};
        const n = limpio(names[thisDeviceId()]);
        if (n) return n;
    } catch {
        /* sin ajustes guardados */
    }
    try {
        const a = limpio(nombreEsteAparato());
        if (a) return a;
    } catch {
        /* sin nombre de aparato */
    }
    return limpio(typeof navigator !== "undefined" ? navigator.platform : "") || "Neurona";
}
