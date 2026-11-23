/**
 * CTL1124B · Registro mínimo de ventanas flotantes de control abiertas en este aparato.
 * Vive aparte de `anfitrion-control.tsx` para que el panel no arrastre `VentanaControl` ni vídeo al montarse.
 */

export interface VentanaControlViva {
    neurona: string;
    nombre: string;
}

let snapshot: readonly VentanaControlViva[] = [];
const oyentes = new Set<() => void>();

export function actualizarVentanasActivas(lista: readonly VentanaControlViva[]): void {
    snapshot = lista.map((x) => ({ neurona: x.neurona, nombre: x.nombre }));
    for (const f of oyentes) {
        try {
            f();
        } catch {
            /* un oyente que falla no rompe a los demás */
        }
    }
}

export function leerVentanasActivas(): readonly VentanaControlViva[] {
    return snapshot;
}

export function suscribirVentanasActivas(cb: () => void): () => void {
    oyentes.add(cb);
    return () => void oyentes.delete(cb);
}
