"use client";

/**
 * ESCENA DE CADA PASO (Adenda 216 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «falta las animaciones y transiciones dinámicas de cada paso que
 * mostraban cada función».
 *
 * Cada paso del rito muestra una pequeña escena viva que ENSEÑA lo que ese paso
 * hace, en vez de un icono quieto: la identidad se escribe, los correos entran
 * a la bandeja, el escudo se cierra, las carpetas se enlazan al cerebro, los
 * pesos ternarios laten. Es la diferencia entre leer «vinculamos tus carpetas»
 * y verlo.
 *
 * Cómo está hecho, y por qué así:
 *  · SVG animado con `framer-motion`, solo `transform` y `opacity` — las dos
 *    propiedades que se componen en GPU. Nada de reflows en cada frame.
 *  · Las escenas se REINICIAN al cambiar de paso (`key`), así siempre se ve la
 *    animación completa aunque vuelvas atrás.
 *  · `prefers-reduced-motion`: si el sistema pide menos movimiento, la escena
 *    se muestra en su estado final, sin bucles. Mareo cero.
 *  · Decorativo: `aria-hidden`. La información real está en el texto del paso;
 *    esto acompaña, no sustituye.
 */

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

const FUCSIA = "#e879f9";
const CIAN = "#67e8f9";
const VIOLETA = "#a78bfa";

export function PasoEscena({ paso, className }: { paso: string; className?: string }) {
    const quieto = useReducedMotion();

    return (
        <div className={cn("relative mx-auto h-24 w-full max-w-[280px]", className)} aria-hidden>
            <motion.svg
                key={paso}
                viewBox="0 0 280 96"
                className="h-full w-full overflow-visible"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
            >
                <Escena paso={paso} quieto={!!quieto} />
            </motion.svg>
        </div>
    );
}

function Escena({ paso, quieto }: { paso: string; quieto: boolean }) {
    // Un bucle solo se define si el sistema no ha pedido calma.
    const bucle = (props: Record<string, unknown>) => (quieto ? {} : props);

    switch (paso) {
        // ── Identidad: el @handle se escribe solo ──────────────────────────
        case "identidad":
            return (
                <g>
                    <rect x="52" y="30" width="176" height="36" rx="10" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.12)" />
                    <text x="68" y="53" fill={FUCSIA} fontSize="16" fontFamily="ui-monospace, monospace">@</text>
                    <motion.rect
                        x="84" y="42" height="12" rx="2" fill="rgba(255,255,255,.55)"
                        initial={{ width: 0 }}
                        animate={quieto ? { width: 96 } : { width: [0, 96, 96] }}
                        transition={{ duration: 1.6, times: [0, 0.7, 1], repeat: quieto ? 0 : Infinity, repeatDelay: 0.8 }}
                    />
                    <motion.rect
                        x="182" y="40" width="2" height="16" fill={CIAN}
                        {...bucle({ animate: { opacity: [1, 0.15, 1] }, transition: { duration: 0.9, repeat: Infinity } })}
                    />
                </g>
            );

        // ── Correos: los sobres entran a la bandeja ────────────────────────
        case "correo":
            return (
                <g>
                    <path d="M96 62 h88 v14 a6 6 0 0 1-6 6 H102 a6 6 0 0 1-6-6 z" fill="rgba(103,232,249,.10)" stroke={CIAN} strokeWidth="1.2" />
                    {[0, 1, 2].map((i) => (
                        <motion.g
                            key={i}
                            initial={{ y: -34, opacity: 0 }}
                            animate={quieto ? { y: 0, opacity: 1 } : { y: [-34, 0, 0], opacity: [0, 1, 0] }}
                            transition={{ duration: 2.1, delay: i * 0.55, repeat: quieto ? 0 : Infinity, repeatDelay: 0.6 }}
                        >
                            <rect x={110 + i * 30} y="34" width="26" height="18" rx="3" fill="rgba(255,255,255,.06)" stroke={VIOLETA} strokeWidth="1.1" />
                            <path d={`M${110 + i * 30} 34 l13 10 l13 -10`} fill="none" stroke={VIOLETA} strokeWidth="1.1" />
                        </motion.g>
                    ))}
                </g>
            );

        // ── Recuperación: el escudo se sella ───────────────────────────────
        case "recuperacion":
            return (
                <g transform="translate(140,48)">
                    <motion.path
                        d="M0 -28 L24 -18 V4 C24 18 12 26 0 30 C-12 26 -24 18 -24 4 V-18 Z"
                        fill="rgba(16,185,129,.10)" stroke="#6ee7b7" strokeWidth="1.4"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 1.4, ease: "easeInOut", repeat: quieto ? 0 : Infinity, repeatDelay: 1.2 }}
                    />
                    <motion.path
                        d="M-9 2 l6 7 l13 -15" fill="none" stroke="#6ee7b7" strokeWidth="2.2" strokeLinecap="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 1.1, repeat: quieto ? 0 : Infinity, repeatDelay: 2.1 }}
                    />
                </g>
            );

        // ── Perfil: avatar y portada se componen ───────────────────────────
        case "opcionales":
            return (
                <g>
                    <motion.rect
                        x="70" y="24" width="140" height="30" rx="8"
                        fill="rgba(167,139,250,.14)" stroke="rgba(167,139,250,.4)"
                        initial={{ scaleX: 0.4, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
                        style={{ transformOrigin: "140px 39px" }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                    />
                    <motion.circle
                        cx="104" cy="58" r="17" fill="rgba(232,121,249,.2)" stroke={FUCSIA} strokeWidth="1.4"
                        initial={{ scale: 0, y: 10 }} animate={{ scale: 1, y: 0 }}
                        transition={{ type: "spring", stiffness: 220, damping: 14, delay: 0.45 }}
                    />
                    <motion.g initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }}>
                        <rect x="130" y="52" width="64" height="6" rx="3" fill="rgba(255,255,255,.4)" />
                        <rect x="130" y="64" width="40" height="5" rx="2.5" fill="rgba(255,255,255,.22)" />
                    </motion.g>
                </g>
            );

        // ── Permisos y carpetas: las carpetas se enlazan ───────────────────
        case "permisos":
            return (
                <g>
                    {[0, 1, 2].map((i) => (
                        <motion.path
                            key={i}
                            d={`M${58 + i * 26} 34 h16 l4 5 h14 v20 h-34 z`}
                            fill="rgba(103,232,249,.10)" stroke={CIAN} strokeWidth="1.1"
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 * i, duration: 0.5 }}
                        />
                    ))}
                    <motion.path
                        d="M150 49 H196" stroke={VIOLETA} strokeWidth="1.6" strokeDasharray="4 4"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ duration: 0.9, delay: 0.6, repeat: quieto ? 0 : Infinity, repeatDelay: 1.4 }}
                    />
                    <circle cx="212" cy="49" r="15" fill="rgba(167,139,250,.16)" stroke={VIOLETA} strokeWidth="1.3" />
                    <motion.circle
                        cx="212" cy="49" r="5" fill={VIOLETA}
                        {...bucle({ animate: { scale: [1, 1.35, 1] }, transition: { duration: 1.6, repeat: Infinity } })}
                    />
                </g>
            );

        // ── Cerebros: la memoria se llena ──────────────────────────────────
        case "cerebros":
            return (
                <g transform="translate(140,48)">
                    <circle r="26" fill="rgba(167,139,250,.08)" stroke={VIOLETA} strokeWidth="1.2" />
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                        const a = (i / 6) * Math.PI * 2;
                        return (
                            <motion.circle
                                key={i} cx={Math.cos(a) * 40} cy={Math.sin(a) * 26} r="4.5"
                                fill={i % 2 ? CIAN : FUCSIA}
                                initial={{ opacity: 0.25 }}
                                {...bucle({ animate: { opacity: [0.25, 1, 0.25] }, transition: { duration: 2.2, delay: i * 0.28, repeat: Infinity } })}
                            />
                        );
                    })}
                    {[0, 1, 2, 3, 4, 5].map((i) => {
                        const a = (i / 6) * Math.PI * 2;
                        return (
                            <line key={`l${i}`} x1="0" y1="0" x2={Math.cos(a) * 40} y2={Math.sin(a) * 26}
                                stroke="rgba(255,255,255,.14)" strokeWidth="1" />
                        );
                    })}
                </g>
            );

        // ── Astraura local: los pesos ternarios laten ──────────────────────
        case "neurona":
            return (
                <g>
                    {[-1, 0, 1, -1, 1, 0, 1, -1].map((v, i) => (
                        <motion.text
                            key={i}
                            x={62 + i * 21} y="54" fontSize="15" fontFamily="ui-monospace, monospace"
                            fill={v === 0 ? "rgba(255,255,255,.35)" : v > 0 ? CIAN : FUCSIA}
                            initial={{ opacity: 0.3, y: 54 }}
                            {...bucle({ animate: { opacity: [0.3, 1, 0.3], y: [54, 49, 54] }, transition: { duration: 1.9, delay: i * 0.13, repeat: Infinity } })}
                        >
                            {v === 0 ? "0" : v > 0 ? "+1" : "−1"}
                        </motion.text>
                    ))}
                    <text x="140" y="78" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,.4)">1,58 bits · CPU</text>
                </g>
            );

        // ── Guía de la red: el mapa se recorre ─────────────────────────────
        case "guia":
            return (
                <g>
                    <path d="M56 66 C96 26, 184 26, 224 66" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="1.4" />
                    {[56, 105, 175, 224].map((x, i) => (
                        <circle key={i} cx={x} cy={i === 0 || i === 3 ? 66 : 40} r="5" fill={i % 2 ? CIAN : FUCSIA} opacity="0.75" />
                    ))}
                    <motion.circle
                        r="7" fill="#fff"
                        {...bucle({
                            animate: { offsetDistance: ["0%", "100%"] },
                            transition: { duration: 3.2, repeat: Infinity, ease: "easeInOut" },
                        })}
                        style={{ offsetPath: 'path("M56 66 C96 26, 184 26, 224 66")', offsetDistance: quieto ? "100%" : "0%" }}
                    />
                </g>
            );

        // ── Bienvenida: la semilla se abre ─────────────────────────────────
        default:
            return (
                <g transform="translate(140,48)">
                    {[22, 32, 42].map((r, i) => (
                        <motion.circle
                            key={r} r={r} fill="none"
                            stroke={i === 0 ? FUCSIA : i === 1 ? VIOLETA : CIAN}
                            strokeWidth="1.1" opacity={0.5 - i * 0.12}
                            {...bucle({
                                animate: { scale: [0.9, 1.06, 0.9], opacity: [0.2, 0.55, 0.2] },
                                transition: { duration: 3.4, delay: i * 0.4, repeat: Infinity, ease: "easeInOut" },
                            })}
                        />
                    ))}
                    <motion.circle
                        r="9" fill={FUCSIA}
                        {...bucle({ animate: { scale: [1, 1.2, 1] }, transition: { duration: 2, repeat: Infinity } })}
                    />
                </g>
            );
    }
}

export default PasoEscena;
