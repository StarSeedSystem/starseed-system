"use client";
/**
 * El cielo de AHORA dibujado con datos: el color sale de la altura real del Sol en tu sitio
 * (noche, crepúsculo, hora dorada, día) y del estado del cielo (nubes, lluvia, niebla,
 * tormenta, nieve); el Sol sube y baja con su altura, de noche sale la Luna con su fase real y
 * las estrellas se apagan detrás de las nubes. Barato: degradados, unas pocas formas y
 * animaciones de transform/opacity que se congelan en eco o sin movimiento.
 *
 * Variantes (el «estilo» del clima en Ajustes): clásica, aurora, cristal, fluido, flora y omni;
 * cambian la capa decorativa, nunca los datos.
 */
import * as React from "react";
import {
    Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudMoon, CloudRain, CloudRainWind,
    CloudSnow, CloudSun, Moon, Sun, type LucideIcon,
} from "lucide-react";
import type { FaseLunar } from "@/lib/astro/cielo";
import { familiaCielo, mezclaHex, type FamiliaCielo } from "@/modules/weather/datos/interpretar";
import s from "./clima.module.css";

export type VarianteCielo = "clasico" | "aurora" | "cristal" | "fluido" | "flora" | "omni";

// ── Paleta ────────────────────────────────────────────────────────────

export interface PaletaCielo { alto: string; bajo: string; horizonte: string; tinta: string; noche: boolean }

/** Color del cielo por altura del Sol (°) y estado; puro, para pruebas y para teñir la vista. */
export function paletaCielo(altura: number | null, familia: FamiliaCielo | null): PaletaCielo {
    let alto: string, bajo: string, horizonte: string;
    const a = altura ?? 30;
    if (a < -12) { alto = "#0b0a2e"; bajo = "#05041a"; horizonte = "#2c2670"; }
    else if (a < -4) { const t = (a + 12) / 8; alto = mezclaHex("#0b0a2e", "#2a1f6b", t); bajo = mezclaHex("#05041a", "#2b1640", t); horizonte = mezclaHex("#2c2670", "#c2577a", t); }
    else if (a < 6) { const t = (a + 4) / 10; alto = mezclaHex("#2a1f6b", "#2f6fd6", t); bajo = mezclaHex("#2b1640", "#1b4c9c", t); horizonte = mezclaHex("#ff7a59", "#ffc46b", t); }
    else if (a < 20) { const t = (a - 6) / 14; alto = mezclaHex("#2f6fd6", "#2b8cff", t); bajo = mezclaHex("#1b4c9c", "#0c5bc0", t); horizonte = mezclaHex("#ffc46b", "#a8dcff", t); }
    else { alto = "#2786f5"; bajo = "#0a4fb0"; horizonte = "#b6e3ff"; }
    const gris = familia === "tormenta" ? "#241b3f" : familia === "lluvia" ? "#3a4658" : familia === "niebla" ? "#6b7280" : familia === "nieve" ? "#8a9ab0" : familia === "nubes" ? "#55627a" : null;
    const peso = familia === "tormenta" ? 0.7 : familia === "lluvia" ? 0.55 : familia === "niebla" ? 0.6 : familia === "nieve" ? 0.45 : familia === "nubes" ? 0.35 : 0;
    if (gris) { alto = mezclaHex(alto, gris, peso); bajo = mezclaHex(bajo, gris, peso * 0.8); horizonte = mezclaHex(horizonte, gris, peso * 0.6); }
    const noche = a < -4;
    return { alto, bajo, horizonte, tinta: noche ? "#c7d2fe" : familia === "despejado" ? "#fde68a" : "#e0f2fe", noche };
}

// ── Icono del cielo (lucide) ──────────────────────────────────────────

export function iconoCielo(codigo: number | null, esDia = true): LucideIcon {
    if (codigo === null) return Cloud;
    if (codigo === 0) return esDia ? Sun : Moon;
    if (codigo <= 2) return esDia ? CloudSun : CloudMoon;
    if (codigo === 3) return Cloud;
    if (codigo === 45 || codigo === 48) return CloudFog;
    if (codigo >= 51 && codigo <= 57) return CloudDrizzle;
    if (codigo === 96 || codigo === 99) return CloudHail;
    if (codigo >= 95) return CloudLightning;
    if ((codigo >= 71 && codigo <= 77) || codigo === 85 || codigo === 86) return CloudSnow;
    if (codigo >= 80 && codigo <= 82) return CloudRainWind;
    return CloudRain;
}

export function colorIcono(codigo: number | null, esDia = true): string {
    const f = familiaCielo(codigo);
    if (f === "despejado") return esDia ? "#fcd34d" : "#c7d2fe";
    if (f === "tormenta") return "#c4b5fd";
    if (f === "lluvia") return "#7dd3fc";
    if (f === "nieve") return "#e0f2fe";
    return "#cbd5e1";
}

// ── Luna ──────────────────────────────────────────────────────────────

/** Trazo de la parte iluminada (centrada en 0,0; creciente = luz a la derecha). */
export function trazoLunaClima(r: number, fase: number): string {
    const rx = Math.max(0.01, Math.abs(Math.cos(2 * Math.PI * fase)) * r);
    const n = (v: number) => Math.round(v * 100) / 100;
    const creciente = fase < 0.5;
    const barrido = creciente ? (fase < 0.25 ? 0 : 1) : (fase < 0.75 ? 0 : 1);
    return `M0 ${n(-r)}A${n(r)} ${n(r)} 0 0 ${creciente ? 1 : 0} 0 ${n(r)}A${n(rx)} ${n(r)} 0 0 ${barrido} 0 ${n(-r)}Z`;
}

export function LunaFase({ r, fase, id, x = 0, y = 0 }: { r: number; fase: FaseLunar; id: string; x?: number; y?: number }) {
    return (
        <g transform={`translate(${x} ${y})`}>
            <defs>
                <radialGradient id={`lh-${id}`}>
                    <stop offset="0%" stopColor="#fff4d6" stopOpacity={0.3 * fase.iluminada + 0.05} />
                    <stop offset="70%" stopColor="#fff4d6" stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`ll-${id}`} cx="40%" cy="35%" r="75%">
                    <stop offset="0%" stopColor="#fffdf5" />
                    <stop offset="70%" stopColor="#e9e4d4" />
                    <stop offset="100%" stopColor="#c9c2ad" />
                </radialGradient>
            </defs>
            <circle r={r * 2.3} fill={`url(#lh-${id})`} />
            <circle r={r} fill="#1d1a33" stroke="#ffffff26" strokeWidth={r * 0.04} />
            <path d={trazoLunaClima(r, fase.fase)} fill={`url(#ll-${id})`} />
            <circle cx={-r * 0.3} cy={-r * 0.2} r={r * 0.16} fill="#00000016" />
            <circle cx={r * 0.25} cy={r * 0.32} r={r * 0.11} fill="#00000012" />
        </g>
    );
}

// ── Escena ────────────────────────────────────────────────────────────

/** Semillas deterministas: la escena no «baila» entre renders. */
const aleatorio = (i: number, k = 1) => {
    const x = Math.sin(i * 127.1 * k + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

export interface PropsCielo {
    codigo: number | null;
    alturaSol: number | null;
    fase: FaseLunar | null;
    nubes?: number | null;
    variante?: VarianteCielo;
    /** Menos partículas en tamaños pequeños. */
    densidad?: "baja" | "normal" | "alta";
    /** Aurora REAL (Kp alto y latitud a su alcance): cortina verde, no decoración. */
    auroraReal?: boolean;
    /** Dónde se dibuja el astro (0-100 del ancho). */
    xAstro?: number;
    className?: string;
}

export function CieloVivo({ codigo, alturaSol, fase, nubes, variante = "clasico", densidad = "normal", auroraReal, xAstro = 76, className }: PropsCielo) {
    const id = React.useId().replace(/:/g, "");
    const familia = familiaCielo(codigo);
    const p = paletaCielo(alturaSol, familia);
    const alt = alturaSol ?? 30;
    const cubierto = familia === "lluvia" || familia === "tormenta" || familia === "niebla" || familia === "nieve";
    const cobertura = nubes ?? (familia === "nubes" ? 60 : cubierto ? 90 : 10);
    const nNubes = familia === "despejado" ? (cobertura > 20 ? 1 : 0) : Math.min(4, Math.max(1, Math.round(cobertura / 25)));
    const factor = densidad === "baja" ? 0.5 : densidad === "alta" ? 1.4 : 1;
    const intensa = codigo !== null && [55, 57, 65, 67, 75, 82, 86, 99].includes(codigo);
    const nGotas = familia === "lluvia" || familia === "tormenta" ? Math.round((intensa ? 22 : 14) * factor) : 0;
    const nCopos = familia === "nieve" ? Math.round(14 * factor) : 0;
    const estrellas = p.noche ? Math.round(22 * factor * (1 - cobertura / 110)) : 0;
    const ySol = 80 - Math.max(-6, Math.min(70, alt)) * 0.85;
    const nubeColor = p.noche ? "#b6bdd6" : familia === "tormenta" ? "#8b86a8" : familia === "lluvia" ? "#c3cad6" : "#ffffff";
    const nubeAlfa = p.noche ? 0.22 : familia === "tormenta" ? 0.7 : cubierto ? 0.62 : 0.55;

    return (
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className={`pointer-events-none absolute inset-0 h-full w-full ${className ?? ""}`}>
            <defs>
                <linearGradient id={`cf-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.alto} />
                    <stop offset="100%" stopColor={p.bajo} />
                </linearGradient>
                <radialGradient id={`ch-${id}`} cx="50%" cy="110%" r="75%">
                    <stop offset="0%" stopColor={p.horizonte} stopOpacity={0.75} />
                    <stop offset="100%" stopColor={p.horizonte} stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`cs-${id}`}>
                    <stop offset="0%" stopColor="#fffbe8" />
                    <stop offset="28%" stopColor={alt < 8 ? "#ffb35c" : "#ffe08a"} />
                    <stop offset="45%" stopColor={alt < 8 ? "#ff7a45" : "#ffc23d"} stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#ffc23d" stopOpacity={0} />
                </radialGradient>
                <radialGradient id={`cn-${id}`}>
                    <stop offset="0%" stopColor={nubeColor} stopOpacity={nubeAlfa} />
                    <stop offset="70%" stopColor={nubeColor} stopOpacity={nubeAlfa * 0.55} />
                    <stop offset="100%" stopColor={nubeColor} stopOpacity={0} />
                </radialGradient>
                <linearGradient id={`ca-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0} />
                    <stop offset="35%" stopColor="#34d399" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
            </defs>

            <rect width="100" height="100" fill={`url(#cf-${id})`} />
            <rect width="100" height="100" fill={`url(#ch-${id})`} />

            {/* Estrellas (solo de noche y según las nubes). */}
            {Array.from({ length: estrellas }, (_, i) => (
                <circle key={`e${i}`} className={i % 3 === 0 ? s.estrella : undefined} cx={aleatorio(i) * 100} cy={aleatorio(i, 2) * 62} r={0.25 + aleatorio(i, 3) * 0.45} fill="#fff"
                    opacity={0.35 + aleatorio(i, 4) * 0.55} style={{ ["--dur" as string]: `${3 + (i % 4)}s`, ["--retraso" as string]: `${(i % 5) * 0.6}s` }} />
            ))}

            {/* Aurora real o decorativa (variante). */}
            {(auroraReal || variante === "aurora") && (
                <g opacity={auroraReal ? (p.noche ? 0.95 : 0.35) : p.noche ? 0.7 : 0.32}>
                    {[0, 1, 2].map((i) => (
                        <path key={`a${i}`} className={s.cortina} style={{ ["--dur" as string]: `${8 + i * 3}s`, ["--retraso" as string]: `${i * 1.3}s` }}
                            d={`M${-10 + i * 18} ${8 + i * 4} C ${20 + i * 10} ${-2 + i * 6}, ${45 + i * 8} ${22 - i * 3}, ${110 - i * 12} ${6 + i * 5} L ${110 - i * 12} ${44 + i * 3} C ${60} ${52 - i * 4}, ${30} ${36 + i * 5}, ${-10 + i * 18} ${48 - i * 2} Z`}
                            fill={`url(#ca-${id})`} />
                    ))}
                </g>
            )}

            {/* Sol (de día y en el crepúsculo). */}
            {alt > -5 && (
                <g className={s.respira} style={{ ["--dur" as string]: "7s" }}>
                    <circle cx={xAstro} cy={ySol} r={cubierto ? 14 : 18} fill={`url(#cs-${id})`} opacity={cubierto ? 0.45 : 1} />
                    {!cubierto && <circle cx={xAstro} cy={ySol} r={5.2} fill="#fff8e1" opacity={alt < 0 ? 0.6 : 0.95} />}
                </g>
            )}

            {/* Luna con su fase real (de noche). */}
            {alt < 2 && fase && (
                <g opacity={cubierto ? 0.5 : 1}>
                    <LunaFase r={6.5} fase={fase} id={id} x={xAstro} y={24} />
                </g>
            )}

            {/* Nubes. */}
            {Array.from({ length: nNubes }, (_, i) => {
                const cx = 12 + ((i * 29 + 8) % 76), cy = 16 + (i % 3) * 13 + (cubierto ? -4 : 0), w = cubierto ? 40 : 30;
                return (
                    <g key={`n${i}`} className={s.nube} style={{ ["--dur" as string]: `${12 + i * 5}s`, ["--retraso" as string]: `${-i * 3}s` }}>
                        <ellipse cx={cx} cy={cy} rx={w * 0.55} ry={w * 0.2} fill={`url(#cn-${id})`} />
                        <ellipse cx={cx - w * 0.18} cy={cy - w * 0.1} rx={w * 0.3} ry={w * 0.2} fill={`url(#cn-${id})`} />
                        <ellipse cx={cx + w * 0.16} cy={cy - w * 0.06} rx={w * 0.26} ry={w * 0.17} fill={`url(#cn-${id})`} />
                    </g>
                );
            })}

            {/* Niebla. */}
            {familia === "niebla" && [0, 1, 2, 3].map((i) => (
                <rect key={`f${i}`} className={s.nube} x={-10 + (i % 2) * 8} y={40 + i * 13} width={100} height={5} rx={2.5} fill="#e5e7eb" opacity={0.16 + (i % 2) * 0.06}
                    style={{ ["--dur" as string]: `${9 + i * 3}s`, ["--retraso" as string]: `${-i * 2}s` }} />
            ))}

            {/* Lluvia. */}
            {Array.from({ length: nGotas }, (_, i) => {
                const x = aleatorio(i, 5) * 104;
                return (
                    <line key={`g${i}`} className={s.gota} x1={x} y1={20} x2={x - 1.4} y2={27} stroke="#bfe6ff" strokeWidth={0.45} strokeLinecap="round"
                        style={{ ["--dur" as string]: `${0.8 + aleatorio(i, 6) * 0.6}s`, ["--retraso" as string]: `${-aleatorio(i, 7) * 1.4}s` }} />
                );
            })}

            {/* Nieve. */}
            {Array.from({ length: nCopos }, (_, i) => (
                <circle key={`c${i}`} className={s.copo} cx={aleatorio(i, 8) * 100} cy={18} r={0.6 + aleatorio(i, 9) * 0.8} fill="#fff"
                    style={{ ["--dur" as string]: `${4 + aleatorio(i, 10) * 3}s`, ["--retraso" as string]: `${-aleatorio(i, 11) * 6}s` }} />
            ))}

            {/* Relámpago. */}
            {familia === "tormenta" && (
                <polyline className={s.rayo} points="58,22 52,40 57,40 50,60" fill="none" stroke="#f5f3ff" strokeWidth={1.1} strokeLinejoin="round" opacity={0} />
            )}

            {/* Capas de estilo. */}
            {variante === "cristal" && (
                <g opacity={0.5} stroke="#ffffff" strokeOpacity={0.14} strokeWidth={0.25} fill="none">
                    <path d="M0 70 L22 48 L40 66 L61 40 L80 60 L100 38" />
                    <path d="M22 48 L30 100 M61 40 L55 100 M80 60 L92 100 M40 66 L48 100" />
                    <polygon points="61,40 80,60 72,100 52,100" fill="#ffffff" fillOpacity={0.04} />
                </g>
            )}
            {variante === "fluido" && (
                <g opacity={0.55}>
                    <path className={s.ola} style={{ ["--dur" as string]: "14s" }} d="M0 82 Q12.5 76 25 82 T50 82 T75 82 T100 82 T125 82 T150 82 T175 82 T200 82 V100 H0 Z" fill={p.horizonte} fillOpacity={0.35} />
                    <path className={s.ola} style={{ ["--dur" as string]: "9s" }} d="M0 88 Q12.5 84 25 88 T50 88 T75 88 T100 88 T125 88 T150 88 T175 88 T200 88 V100 H0 Z" fill="#ffffff" fillOpacity={0.12} />
                </g>
            )}
            {variante === "flora" && (
                <g fill={p.noche ? "#0f2a24" : "#14532d"} opacity={0.75}>
                    {[8, 22, 37, 63, 80, 93].map((x, i) => (
                        <path key={`p${i}`} className={s.planta} style={{ ["--dur" as string]: `${6 + i}s`, ["--retraso" as string]: `${-i}s` }}
                            d={`M${x} 100 C ${x - 1} ${92 - (i % 3) * 4}, ${x - 5} ${86 - (i % 3) * 5}, ${x - 7} ${80 - (i % 3) * 6} C ${x - 2} ${84 - (i % 3) * 4}, ${x + 1} ${90}, ${x + 1.2} 100 Z M${x + 0.6} 100 C ${x + 2} ${92}, ${x + 6} ${88 - (i % 2) * 5}, ${x + 8} ${84 - (i % 2) * 6} C ${x + 4} ${90}, ${x + 2} ${95}, ${x + 1.6} 100 Z`} />
                    ))}
                </g>
            )}
            {variante === "omni" && (
                <g fill="none" stroke="#ffffff" strokeOpacity={0.08} strokeWidth={0.3}>
                    {[20, 40, 60, 80].map((y) => <path key={`o${y}`} d={`M0 ${y} Q50 ${y - 8} 100 ${y}`} />)}
                    {[20, 50, 80].map((x) => <path key={`m${x}`} d={`M${x} 0 Q${x + (x - 50) * 0.2} 50 ${x} 100`} />)}
                </g>
            )}

            {/* Suelo de luz: legibilidad del texto sobre cualquier cielo. */}
            <rect width="100" height="100" fill="#050716" opacity={0.18} />
        </svg>
    );
}
