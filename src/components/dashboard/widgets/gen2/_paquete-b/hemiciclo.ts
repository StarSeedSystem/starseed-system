/**
 * Hemiciclo de decisiones (paquete B · Ola 0929) — PURO.
 *
 * Cada asiento es UNA propuesta real del Ágora, colocada en un semicírculo como un parlamento:
 * de izquierda a derecha, aprobadas · en votación (sin tu voto / con tu voto) · rechazadas ·
 * caducadas. Las filas se reparten por longitud de arco para que la densidad sea pareja.
 */
import type { PropuestaViva } from "./datos-civicos";

export interface Asiento {
    x: number;
    y: number;
    r: number;
    /** Ángulo en radianes (π = izquierda, 0 = derecha). */
    angulo: number;
    fila: number;
}

/** Caja del dibujo (viewBox) y centro del semicírculo. */
export const HEMI = { ancho: 200, alto: 108, cx: 100, cy: 100, rMin: 38, rMax: 92 } as const;

export function filasPara(n: number): number {
    if (n <= 6) return 1;
    if (n <= 16) return 2;
    if (n <= 32) return 3;
    return 4;
}

/** Posiciones de `n` asientos ordenadas de izquierda a derecha. */
export function asientosHemiciclo(n: number): Asiento[] {
    if (n <= 0) return [];
    const filas = filasPara(n);
    const radios = Array.from({ length: filas }, (_, i) => (filas === 1 ? (HEMI.rMin + HEMI.rMax) / 2 + 12 : HEMI.rMin + ((HEMI.rMax - HEMI.rMin) * i) / (filas - 1)));
    const suma = radios.reduce((s, r) => s + r, 0);
    const porFila = radios.map((r) => Math.max(1, Math.round((n * r) / suma)));
    // Ajuste de redondeo: la diferencia va a la fila exterior (la que más cabe).
    let dif = n - porFila.reduce((s, k) => s + k, 0);
    for (let i = filas - 1, vueltas = 0; dif !== 0 && vueltas < 400; i = (i - 1 + filas) % filas, vueltas++) {
        if (dif > 0) { porFila[i] += 1; dif -= 1; } else if (porFila[i] > 1) { porFila[i] -= 1; dif += 1; }
    }
    const hueco = filas > 1 ? (HEMI.rMax - HEMI.rMin) / (filas - 1) : 30;
    const asientos: Asiento[] = [];
    radios.forEach((radio, f) => {
        const k = porFila[f];
        const paso = k > 1 ? Math.PI / (k - 1) : 0;
        const arco = k > 1 ? radio * paso : 40;
        const r = Math.max(2.2, Math.min(9, Math.min(arco, hueco) * 0.4));
        for (let j = 0; j < k; j++) {
            const a = k > 1 ? Math.PI - j * paso : Math.PI / 2;
            asientos.push({ x: HEMI.cx + Math.cos(a) * radio, y: HEMI.cy - Math.sin(a) * radio, r, angulo: a, fila: f });
        }
    });
    return asientos.sort((a, b) => b.angulo - a.angulo || a.fila - b.fila);
}

export type GrupoAsiento = "aprobada" | "pendiente" | "votada" | "rechazada" | "caducada";

export function grupoDe(p: Pick<PropuestaViva, "estado" | "miVoto">): GrupoAsiento {
    if (p.estado === "passed" || p.estado === "executed") return "aprobada";
    if (p.estado === "open") return p.miVoto ? "votada" : "pendiente";
    if (p.estado === "rejected" || p.estado === "failed") return "rechazada";
    return "caducada";
}

const ORDEN_GRUPO: Record<GrupoAsiento, number> = { aprobada: 0, votada: 1, pendiente: 2, rechazada: 3, caducada: 4 };

/** Propuestas en el orden del hemiciclo, con su asiento. */
export function sentar<T extends Pick<PropuestaViva, "estado" | "miVoto" | "creada">>(lista: T[]): { p: T; asiento: Asiento; grupo: GrupoAsiento }[] {
    const ordenadas = [...lista].sort((a, b) => ORDEN_GRUPO[grupoDe(a)] - ORDEN_GRUPO[grupoDe(b)] || a.creada - b.creada);
    const asientos = asientosHemiciclo(ordenadas.length);
    return ordenadas.map((p, i) => ({ p, asiento: asientos[i], grupo: grupoDe(p) }));
}

/** Recuento por grupo (para la leyenda). */
export function recuentoGrupos(lista: Pick<PropuestaViva, "estado" | "miVoto">[]): Record<GrupoAsiento, number> {
    const r: Record<GrupoAsiento, number> = { aprobada: 0, pendiente: 0, votada: 0, rechazada: 0, caducada: 0 };
    for (const p of lista) r[grupoDe(p)] += 1;
    return r;
}
