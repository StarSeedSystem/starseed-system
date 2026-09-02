"use client";

/**
 * CARGADOR STARSEED (Adenda 216 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * La semilla de StarSeed girando en 3D mientras algo carga, con el porcentaje
 * debajo cuando se conoce.
 *
 * DECISIONES, porque un cargador se ve mil veces y cada detalle pesa:
 *
 *  · **Sin WebGL ni librerías 3D.** Todo es CSS `transform-style: preserve-3d`
 *    sobre cuatro anillos y un núcleo. Un cargador que arrastra Three.js
 *    contradice el principio del OS: tiene que ir fino en el equipo más
 *    modesto, y es lo primero que se pinta cuando aún no hay nada cargado.
 *  · **Compuesto solo con `transform` y `opacity`**, las dos propiedades que el
 *    navegador anima en la GPU sin recalcular diseño. Cero `layout thrash`.
 *  · **Respeta `prefers-reduced-motion`**: si el sistema pide menos animación,
 *    la semilla late suavemente en vez de girar. El movimiento constante marea
 *    a quien tiene sensibilidad vestibular, y una carga no es negociable.
 *  · **El porcentaje es opcional**: si no se conoce el progreso NO se inventa
 *    una barra que avanza sola — eso es mentirle al usuario sobre cuánto falta.
 *    Sin dato, solo gira y dice qué está haciendo.
 */

import { cn } from "@/lib/utils";

export interface StarSeedLoaderProps {
    /** 0–100. Omítelo si el progreso no se conoce: no se inventa una barra. */
    progreso?: number;
    /** Qué se está cargando ahora («Trayendo la voz de Astraura…»). */
    etiqueta?: string;
    /** sm 48px · md 76px · lg 120px */
    tamano?: "sm" | "md" | "lg";
    className?: string;
}

const MEDIDAS = { sm: 48, md: 76, lg: 120 } as const;

export function StarSeedLoader({ progreso, etiqueta, tamano = "md", className }: StarSeedLoaderProps) {
    const px = MEDIDAS[tamano];
    const pct = typeof progreso === "number" ? Math.max(0, Math.min(100, Math.round(progreso))) : null;

    return (
        <div className={cn("flex flex-col items-center gap-3", className)} role="status" aria-live="polite">
            <div
                className="ss-loader relative"
                style={{ width: px, height: px, perspective: `${px * 3}px` }}
                aria-hidden
            >
                <div className="ss-loader-orbita">
                    {/* Cuatro anillos en planos distintos: el volumen nace del
                        cruce entre ellos, no de una malla 3D. */}
                    <span className="ss-anillo ss-anillo-1" />
                    <span className="ss-anillo ss-anillo-2" />
                    <span className="ss-anillo ss-anillo-3" />
                    <span className="ss-anillo ss-anillo-4" />
                    {/* Núcleo: la semilla. Late al ritmo del giro. */}
                    <span className="ss-nucleo" />
                </div>
            </div>

            {pct !== null && (
                <div className="flex flex-col items-center gap-1.5" style={{ width: Math.max(px * 1.6, 120) }}>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-300 transition-[width] duration-300 ease-out"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-white/70">{pct}%</span>
                </div>
            )}

            {etiqueta && (
                <span className="max-w-[22rem] text-center text-[11.5px] leading-snug text-white/55">{etiqueta}</span>
            )}
            <span className="sr-only">{etiqueta || "Cargando"}{pct !== null ? ` · ${pct}%` : ""}</span>

            <style jsx>{`
                .ss-loader-orbita {
                    position: absolute;
                    inset: 0;
                    transform-style: preserve-3d;
                    animation: ss-giro 3.6s linear infinite;
                }
                .ss-anillo {
                    position: absolute;
                    inset: 0;
                    border-radius: 50%;
                    border: 1.5px solid transparent;
                    transform-style: preserve-3d;
                }
                /* Cada anillo aporta un arco de color: juntos dibujan la esfera. */
                .ss-anillo-1 {
                    border-top-color: rgba(232, 121, 249, 0.9);
                    border-bottom-color: rgba(232, 121, 249, 0.25);
                    transform: rotateY(0deg) rotateX(68deg);
                }
                .ss-anillo-2 {
                    border-top-color: rgba(103, 232, 249, 0.85);
                    border-bottom-color: rgba(103, 232, 249, 0.2);
                    transform: rotateY(60deg) rotateX(68deg);
                }
                .ss-anillo-3 {
                    border-top-color: rgba(167, 139, 250, 0.8);
                    border-bottom-color: rgba(167, 139, 250, 0.2);
                    transform: rotateY(120deg) rotateX(68deg);
                }
                .ss-anillo-4 {
                    border-left-color: rgba(255, 255, 255, 0.55);
                    border-right-color: rgba(255, 255, 255, 0.12);
                    transform: rotateX(0deg);
                    animation: ss-contragiro 2.4s linear infinite;
                }
                .ss-nucleo {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    width: 26%;
                    height: 26%;
                    margin-left: -13%;
                    margin-top: -13%;
                    border-radius: 50%;
                    background: radial-gradient(circle at 35% 30%, #fdf4ff 0%, #e879f9 45%, #22d3ee 100%);
                    box-shadow: 0 0 14px 2px rgba(232, 121, 249, 0.55);
                    animation: ss-latido 1.8s ease-in-out infinite;
                }

                @keyframes ss-giro {
                    from { transform: rotateY(0deg) rotateZ(0deg); }
                    to   { transform: rotateY(360deg) rotateZ(360deg); }
                }
                @keyframes ss-contragiro {
                    from { transform: rotateX(0deg) rotateZ(0deg); }
                    to   { transform: rotateX(-360deg) rotateZ(-360deg); }
                }
                @keyframes ss-latido {
                    0%, 100% { transform: scale(1); opacity: 0.9; }
                    50%      { transform: scale(1.18); opacity: 1; }
                }

                /* Menos movimiento: la semilla late, no gira. */
                @media (prefers-reduced-motion: reduce) {
                    .ss-loader-orbita,
                    .ss-anillo-4 { animation: none; }
                    .ss-nucleo { animation: ss-latido 2.6s ease-in-out infinite; }
                }
            `}</style>
        </div>
    );
}

export default StarSeedLoader;
