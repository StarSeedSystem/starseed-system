/**
 * StarSeed XR · MEDIDOR DE FOTOGRAMAS (puro, sin WebXR ni red).
 * `crearMedidor(ventana = 90)` → {registrar(dtMs: number): void; media(): number; p95(): number; presupuesto(hz: number): number}
 * Ventana deslizante, descarte de fotogramas absurdos (>250 ms).
 */
export function crearMededor(ventana = 90) {
    const hist: number[] = [];
    return {
        registrar(dtMs: number): void {
            if (dtMs > 250) return;
            hist.push(dtMs);
            if (hist.length > ventana) hist.shift();
        },
        media(): number {
            if (hist.length === 0) return 0;
            const s = hist.reduce((a, b) => a + b, 0);
            return s / hist.length;
        },
        p95(): number {
            if (hist.length === 0) return 0;
            const copy = [...hist].sort((a, b) => a - b);
            const idx = Math.ceil(0.95 * copy.length) - 1;
            return copy[Math.max(0, idx)];
        },
        presupuesto(hz: number): number {
            return 1000 / Math.max(30, hz);
        },
    };
}