"use client";

/**
 * CTL1117I · la onda de TU clic en la imagen en vivo: aparece al instante (eco local, sin esperar al vídeo) en tu color público,
 * con el mismo diseño que el toque nativo del aparato controlado: un anillo que se abre y se apaga en ~450 ms y un punto en el
 * centro. Nada de esto se manda: es solo lo que ves tú. Con «reducir movimiento» no se anima (queda quieta y se apaga igual).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const DURACION_ONDA_MS = 450;
const MAX_ONDAS = 12;

export interface Onda {
    id: number;
    x: number;
    y: number;
}

/** Las ondas vivas; cada una se retira sola a los 450 ms. */
export function useOndas(duracionMs = DURACION_ONDA_MS): { ondas: Onda[]; lanzar: (x: number, y: number) => void } {
    const [ondas, setOndas] = useState<Onda[]>([]);
    const siguiente = useRef(1);
    const temporizadores = useRef(new Set<ReturnType<typeof setTimeout>>());
    const lanzar = useCallback(
        (x: number, y: number) => {
            const id = siguiente.current++;
            setOndas((o) => [...o.slice(-(MAX_ONDAS - 1)), { id, x, y }]);
            const t = setTimeout(() => {
                temporizadores.current.delete(t);
                setOndas((o) => o.filter((w) => w.id !== id));
            }, duracionMs);
            temporizadores.current.add(t);
        },
        [duracionMs],
    );
    useEffect(() => {
        const ts = temporizadores.current;
        return () => {
            for (const t of ts) clearTimeout(t);
            ts.clear();
        };
    }, []);
    return { ondas, lanzar };
}

/** Pinta las ondas (posiciones relativas a la caja que las contiene). */
export function CapaOndas({ ondas, color, duracionMs = DURACION_ONDA_MS }: { ondas: Onda[]; color: string; duracionMs?: number }) {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden data-testid="capa-ondas">
            <style>{`
@keyframes starseed-onda-anillo { from { transform: translate(-50%, -50%) scale(0.35); opacity: 0.95; } to { transform: translate(-50%, -50%) scale(1.5); opacity: 0; } }
@keyframes starseed-onda-punto { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .starseed-onda-anillo { animation-name: starseed-onda-punto !important; transform: translate(-50%, -50%) scale(1) !important; } }`}</style>
            {ondas.map((o) => (
                <span key={o.id} data-testid="onda-toque" data-color={color} className="absolute" style={{ left: o.x, top: o.y }}>
                    <span
                        className="starseed-onda-anillo absolute block rounded-full"
                        style={{
                            width: 56,
                            height: 56,
                            border: `3px solid ${color}`,
                            boxShadow: "0 0 0 1px rgba(255,255,255,0.85), inset 0 0 0 1px rgba(255,255,255,0.85)",
                            transform: "translate(-50%, -50%)",
                            animation: `starseed-onda-anillo ${duracionMs}ms ease-out forwards`,
                        }}
                    />
                    <span
                        className="absolute block rounded-full"
                        style={{
                            width: 12,
                            height: 12,
                            backgroundColor: color,
                            border: "2px solid #fff",
                            transform: "translate(-50%, -50%)",
                            animation: `starseed-onda-punto ${duracionMs}ms ease-out forwards`,
                        }}
                    />
                </span>
            ))}
        </div>
    );
}
