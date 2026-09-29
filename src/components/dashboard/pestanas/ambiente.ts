/**
 * Fondo ambiental de cada pestaña temática (2026-09-29) — PURO.
 *
 * Dos capas muy tenues detrás de los widgets: la LUZ del tema (dos resplandores en las esquinas,
 * con los acentos de la familia) y un MOTIVO dibujado que cuenta de qué va el espacio (constelación
 * en Astronomía, isobaras en Clima, hemiciclo en Política, circuito en Sistema…). El motivo es un
 * SVG estático generado aquí con constantes y el color ya validado (#rrggbb): ningún dato de la
 * persona entra en el dibujo. Se desvanece hacia el centro para no competir con el contenido.
 *
 * La animación (solo la deriva lenta de la luz, `transform`) vive en `dashboard-tabs.module.css`
 * y se apaga con movimiento reducido y en modo eco.
 */
import type { CSSProperties } from "react";
import { conAlfa, type MotivoAmbiente } from "./temas";

const HEX = /^#[0-9a-fA-F]{6}$/;

function color(hex: string): string {
    return HEX.test(hex) ? hex : "#7c5cff";
}

/** Dibujo (tesela SVG) de cada motivo. `c` ya es un #rrggbb válido. */
function tesela(motivo: MotivoAmbiente, c: string): { svg: string; tam: string; repetir: boolean; posicion?: string } | null {
    const t = `stroke="${c}" fill="none" stroke-linecap="round"`;
    switch (motivo) {
        case "constelacion":
            return {
                tam: "260px 260px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="260"><g fill="${c}"><circle cx="24" cy="30" r="1.4"/><circle cx="92" cy="64" r="1"/><circle cx="148" cy="22" r="1.6"/><circle cx="210" cy="90" r="1.1"/><circle cx="58" cy="150" r="1.2"/><circle cx="130" cy="176" r="1.8"/><circle cx="232" cy="200" r="1"/><circle cx="18" cy="236" r="1.1"/><circle cx="180" cy="246" r="1.3"/></g><path d="M24 30 L92 64 L148 22 M130 176 L210 90 M58 150 L130 176" ${t} stroke-width=".6" stroke-opacity=".7"/></svg>`,
            };
        case "isobaras":
            return {
                tam: "420px 220px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><g ${t} stroke-width="1"><path d="M0 40 C 90 10, 160 70, 240 40 S 380 10, 420 40"/><path d="M0 110 C 80 80, 170 140, 250 110 S 370 80, 420 110"/><path d="M0 180 C 100 150, 160 210, 260 180 S 360 150, 420 180"/></g></svg>`,
            };
        case "topografia":
            return {
                tam: "360px 360px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="360"><g ${t} stroke-width=".9"><ellipse cx="120" cy="130" rx="40" ry="28"/><ellipse cx="120" cy="130" rx="78" ry="56"/><ellipse cx="120" cy="130" rx="116" ry="86"/><ellipse cx="290" cy="290" rx="30" ry="22"/><ellipse cx="290" cy="290" rx="62" ry="46"/></g></svg>`,
            };
        case "circuito":
            return {
                tam: "120px 120px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><g ${t} stroke-width=".8"><path d="M0 60 H40 V20 H80 M80 20 V0 M60 120 V90 H100 V60 H120"/></g><g fill="${c}"><rect x="37" y="57" width="6" height="6" rx="1"/><rect x="77" y="17" width="6" height="6" rx="1"/><rect x="97" y="57" width="6" height="6" rx="1"/></g></svg>`,
            };
        case "hemiciclo":
            return {
                tam: "min(1100px, 120%) auto", repetir: false, posicion: "50% 118%",
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="560" viewBox="0 0 1100 560"><g ${t} stroke-width="1.2"><path d="M150 560 A400 400 0 0 1 950 560"/><path d="M230 560 A320 320 0 0 1 870 560"/><path d="M310 560 A240 240 0 0 1 790 560"/><path d="M390 560 A160 160 0 0 1 710 560"/></g></svg>`,
            };
        case "red":
            return {
                tam: "300px 240px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240"><g ${t} stroke-width=".7"><path d="M30 40 L120 90 L210 30 L270 120 L180 200 L120 90 M30 40 L60 180 L180 200"/></g><g fill="${c}"><circle cx="30" cy="40" r="2.4"/><circle cx="120" cy="90" r="3"/><circle cx="210" cy="30" r="2"/><circle cx="270" cy="120" r="2.4"/><circle cx="180" cy="200" r="2.6"/><circle cx="60" cy="180" r="2"/></g></svg>`,
            };
        case "neuronal":
            return {
                tam: "320px 260px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="260"><g ${t} stroke-width=".8"><path d="M40 60 C 100 20, 140 120, 200 80 S 280 40, 300 120"/><path d="M20 200 C 90 160, 130 230, 210 190 S 290 150, 310 210"/><path d="M200 80 C 190 130, 220 160, 210 190"/></g><g fill="${c}"><circle cx="40" cy="60" r="2.2"/><circle cx="200" cy="80" r="3"/><circle cx="210" cy="190" r="2.6"/><circle cx="300" cy="120" r="2"/></g></svg>`,
            };
        case "estudio":
            return {
                tam: "28px 28px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="2" cy="2" r="1" fill="${c}"/></svg>`,
            };
        case "herramientas":
            return {
                tam: "56px 56px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><path d="M28 23 V33 M23 28 H33" ${t} stroke-width="1"/></svg>`,
            };
        case "enfoque":
            return {
                tam: "100% 34px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="34" preserveAspectRatio="none"><path d="M0 33.5 H400" ${t} stroke-width=".6"/></svg>`,
            };
        case "flujo":
            return {
                tam: "480px 260px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260"><g ${t} stroke-width="1"><path d="M0 200 C 120 200, 160 60, 300 60 S 440 140, 480 120"/><path d="M0 220 C 130 220, 170 90, 310 90 S 440 170, 480 150"/><path d="M0 240 C 140 240, 180 120, 320 120 S 440 200, 480 180"/></g></svg>`,
            };
        case "prisma":
            return {
                tam: "90px 90px", repetir: true,
                svg: `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="90"><path d="M0 90 L90 0" ${t} stroke-width=".7"/></svg>`,
            };
        case "pinceladas":
        case "aurora":
        default:
            return null; // solo luz
    }
}

/** El SVG como `url("data:…")` para `background-image`. */
export function urlDeSvg(svg: string): string {
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export interface CapasAmbiente {
    /** Resplandores (la capa que deriva despacio). */
    luz: CSSProperties;
    /** Motivo dibujado (estático), o null si el tema es solo luz. */
    motivo: CSSProperties | null;
}

/**
 * Las capas del fondo de una pestaña. `intensidad` 0..1 (1 = la de siempre; en «ligero» baja).
 */
export function capasAmbiente(motivo: MotivoAmbiente, acento: string, acento2: string, intensidad = 1): CapasAmbiente {
    const a = color(acento);
    const b = color(acento2);
    const k = Math.max(0, Math.min(1, intensidad));
    const pinceladas = motivo === "pinceladas";
    const luz: CSSProperties = {
        backgroundImage: [
            `radial-gradient(60% 55% at 8% -6%, ${conAlfa(a, 0.2 * k)}, transparent 70%)`,
            `radial-gradient(50% 45% at 102% 4%, ${conAlfa(b, 0.14 * k)}, transparent 70%)`,
            pinceladas
                ? `radial-gradient(40% 35% at 70% 85%, ${conAlfa(a, 0.12 * k)}, transparent 70%), radial-gradient(35% 30% at 18% 70%, ${conAlfa(b, 0.1 * k)}, transparent 70%)`
                : `radial-gradient(70% 50% at 50% 120%, ${conAlfa(a, 0.08 * k)}, transparent 70%)`,
        ].join(", "),
    };
    const t = tesela(motivo, a);
    if (!t || k === 0) return { luz, motivo: null };
    return {
        luz,
        motivo: {
            backgroundImage: urlDeSvg(t.svg),
            backgroundSize: t.tam,
            backgroundRepeat: t.repetir ? "repeat" : "no-repeat",
            backgroundPosition: t.posicion ?? "0 0",
            opacity: 0.1 * k,
            // Se desvanece hacia el centro: el dibujo vive en los bordes, el contenido respira.
            WebkitMaskImage: "radial-gradient(120% 90% at 50% 45%, transparent 35%, #000 95%)",
            maskImage: "radial-gradient(120% 90% at 50% 45%, transparent 35%, #000 95%)",
        },
    };
}
