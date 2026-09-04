"use client";

/**
 * AVATARVIVO — EL AVATAR UNIVERSAL CON VIDA (Ola 229 · M3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un solo avatar para perfil, publicaciones, biblioteca y chat. Tres fuentes:
 *
 *  · glb        → `<model-viewer>` (mismo patrón que el perfil): el clip se
 *                 aplica al visor; si el modelo trae animación propia con
 *                 esqueleto, se reproduce sola, y el balanceo/respiración de
 *                 la raíz del clip mueve el contenedor (2,5D) para que NUNCA
 *                 parezca muerto.
 *  · imagen     → `<img>` con movimiento 2,5D derivado del clip.
 *  · procedural → SVG (orbes de `persona-avatar`) con el mismo 2,5D.
 *
 * El movimiento lo decide el motor único «Vida StarSeed» (M1) vía
 * `useMovimiento` (M3): mismo gesto, misma identidad, nivel según hardware.
 * Con `prefers-reduced-motion` todo queda quieto y accesible.
 */

import { createElement, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Gesto } from "@/lib/avatares/movimiento/motor";
import { useMovimiento } from "./usar-movimiento";

/** Las tres fuentes de avatar que acepta el componente. */
export type FuenteAvatar =
    | { tipo: "glb"; url: string }
    | { tipo: "imagen"; url: string }
    | { tipo: "procedural"; svg: string };

export interface AvatarVivoProps {
    fuente: FuenteAvatar;
    gesto?: Gesto | null;
    /** Tamaño en píxeles (número) o CSS (cadena como "100%"). */
    tamano?: number | string;
    /** `true` = controles de cámara en el visor 3D. */
    interactivo?: boolean;
    personalidadId?: string;
    className?: string;
}

/* ───────────────────────── Carga perezosa de model-viewer ─────────────────────
 * Igual que en el perfil (Adenda 219): web component de Google cargado UNA sola
 * vez y solo si hay avatar GLB. Con React 19 se monta con `createElement`. */

let cargaMV: Promise<void> | null = null;

function cargarModelViewer(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (customElements.get("model-viewer")) return Promise.resolve();
    if (cargaMV) return cargaMV;
    cargaMV = import("@google/model-viewer").then(() => undefined);
    return cargaMV;
}

/* ────────────────────── Movimiento 2,5D derivado del clip ──────────────────────
 * Del clip (rotaciones de 22-30 articulaciones + raíz) se destilan las pocas
 * magnitudes que un contenedor 2D puede representar con honestidad: balanceo,
 * respiración, énfasis y parpadeo. Así un avatar de imagen o procedural respira
 * con el MISMO tempo que un avatar 3D haría con esqueleto. */

interface Movimiento25D {
    /** Inclinación lateral en grados (balanceo de cadera/torso). */
    balanceoDeg: number;
    /** Desplazamiento vertical en % (respiración de la raíz). */
    respiracionPct: number;
    /** Escala del énfasis (1 = neutro; sube en gestos de energía). */
    escala: number;
    /** 0-1 de la fase de parpadeo (usada como opacidad del velo). */
    parpadeo: number;
    /** Rotación vertical en grados (asentir / mirar). */
    inclinacionDeg: number;
}

function clamp(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

/** Destila un fotograma del clip en las magnitudes 2,5D del contenedor. */
function resumir25D(
    rotaciones: number[],
    raiz?: number[],
    energia?: number,
): Movimiento25D {
    // Esqueleto SMPL-X de 22 (procedural) o SOMA de 30 (Kimodo): se usan las
    // primeras articulaciones, que en ambos son pelvis → columna → cabeza.
    const pelvis = rotaciones[0] ?? 0;
    const columna = rotaciones.slice(1, 4).reduce((a, b) => a + b, 0) / 3;
    const cabeza = rotaciones[4] ?? columna;
    const saltoRaiz = raiz?.[1] ?? 0; // eje Y de la raíz: respiración
    const e = energia ?? 0.5;

    // Rotaciones del motor son radianes pequeños (~0.02-0.15); se amplifican a
    // un rango visible en 2D (±6° de balanceo, ±4° de inclinación).
    const balanceoDeg = clamp(pelvis * 45 + columna * 12, -8, 8);
    const inclinacionDeg = clamp(cabeza * 38, -5, 5);
    const respiracionPct = clamp(saltoRaiz * 140, -4, 4);
    const escala = 1 + clamp(columna * e * 0.35, -0.04, 0.05);
    // Parpadeo: fase rápida de la señal de cabeza, normalizada al ciclo. Se
    // aplica como un velo de opacidad sobre la imagen (abajo, en `opacidad`).
    const parpadeo = clamp(Math.abs(Math.sin(cabeza * 9)), 0, 1) * 0.12;

    return { balanceoDeg, respiracionPct, escala, parpadeo, inclinacionDeg };
}

/** Opacidad del velo de parpadeo: 1 = ojo abierto, baja al cerrar. */
function opacidadParpadeo(m: Movimiento25D | null): number {
    return m ? 1 - m.parpadeo : 1;
}

/* ──────────────────────────── GLB con esqueleto ────────────────────────────────
 * `<model-viewer>` no expone las matrices de huesos, pero sí deja transformar
 * el modelo completo. La vía honesta en este escalón: aplicar el clip al
 * CONTENEDOR del visor como 2,5D (la raíz del clip es literalmente el balanceo
 * y la respiración del modelo) y, si el GLB no tiene animaciones internas,
 * sumar una deriva de rotación suave para que respire. */

interface Estilo25D extends React.CSSProperties {
    [key: string]: string | number | undefined;
}

/** Construye el estilo 2,5D del fotograma actual (o reposo si no hay clip). */
function estilo25D(m: Movimiento25D | null, suave: boolean): Estilo25D {
    if (!m) {
        return suave
            ? { transform: "rotate(0.4deg)", transition: "transform 300ms ease-in-out" }
            : {};
    }
    return {
        transform:
            `translateY(${m.respiracionPct.toFixed(2)}%) ` +
            `rotate(${m.balanceoDeg.toFixed(2)}deg) ` +
            `rotateX(${m.inclinacionDeg.toFixed(2)}deg) ` +
            `scale(${m.escala.toFixed(3)})`,
        transition: "transform 90ms linear",
        willChange: "transform",
    };
}

/* ──────────────────────────────── Componente ───────────────────────────────── */

export function AvatarVivo({
    fuente,
    gesto = null,
    tamano = 160,
    interactivo = false,
    personalidadId,
    className,
}: AvatarVivoProps) {
    const { clip, nivel, fotograma } = useMovimiento(gesto, {
        personalidadId,
    });

    const [listo, setListo] = useState(false); // model-viewer cargado
    const [fallo, setFallo] = useState<string | null>(null);
    const [reducir, setReducir] = useState(false);

    // Movimiento reducido reactivo: si cambia la preferencia del sistema, la
    // animación suave de respaldo se corta (el hook ya se protege igual).
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        let mq: MediaQueryList;
        try {
            mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        } catch {
            return;
        }
        const aplicar = () => setReducir(mq.matches);
        aplicar();
        mq.addEventListener("change", aplicar);
        return () => mq.removeEventListener("change", aplicar);
    }, []);

    useEffect(() => {
        if (fuente.tipo !== "glb") return;
        let vivo = true;
        setListo(false);
        cargarModelViewer()
            .then(() => vivo && setListo(true))
            .catch((e: unknown) => vivo && setFallo(String((e as { message?: string })?.message || e)));
        return () => {
            vivo = false;
        };
    }, [fuente.tipo]);

    // El resumen 2,5D del fotograma actual: la vida de TODO avatar.
    const resumen = useMemo(() => {
        if (!clip || !clip.rotaciones[fotograma]) return null;
        return resumir25D(
            clip.rotaciones[fotograma],
            clip.raiz?.[fotograma],
            gesto?.energia,
        );
    }, [clip, fotograma, gesto?.energia]);

    const dimension =
        typeof tamano === "number" ? `${tamano}px` : tamano;

    const etiqueta =
        "Avatar animado" + (gesto ? `: ${gesto.prompt}` : "");

    /* ── Imagen y procedural: la vida viene del 2,5D del contenedor ── */
    if (fuente.tipo === "imagen" || fuente.tipo === "procedural") {
        const src =
            fuente.tipo === "imagen"
                ? fuente.url
                : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fuente.svg)}`;
        return (
            <div
                className={cn("relative inline-block select-none", className)}
                style={{ width: dimension, height: dimension }}
                role="img"
                aria-label={etiqueta}
                data-nivel-movimiento={nivel ?? undefined}
            >
                <div
                    className="h-full w-full cursor-pointer overflow-hidden rounded-2xl"
                    style={estilo25D(resumen, !resumen && !reducir)}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt={etiqueta}
                        className="h-full w-full object-cover"
                        draggable={false}
                        style={{
                            transform: `scale(${(resumen?.escala ?? 1).toFixed(3)})`,
                            opacity: opacidadParpadeo(resumen),
                        }}
                    />
                </div>
            </div>
        );
    }

    /* ── GLB: model-viewer; el clip se aplica como vida del contenedor ── */
    if (fallo) {
        return (
            <div
                className={cn(
                    "flex items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-center text-[10.5px] text-white/55",
                    className,
                )}
                style={{ width: dimension, height: dimension }}
                role="img"
                aria-label="No se pudo cargar el visor 3D del avatar"
            >
                No se pudo cargar el visor 3D.
            </div>
        );
    }
    if (!listo) {
        return (
            <div
                className={cn(
                    reducir ? "rounded-2xl border border-white/10 bg-white/[0.04]" : "animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]",
                    className,
                )}
                style={{ width: dimension, height: dimension }}
                aria-hidden="true"
            />
        );
    }

    return (
        <div
            className={cn("relative inline-block select-none", className)}
            style={{ width: dimension, height: dimension }}
            data-nivel-movimiento={nivel ?? undefined}
        >
            <div className="h-full w-full" style={estilo25D(resumen, !resumen && !reducir)}>
                {createElement("model-viewer", {
                    src: fuente.url,
                    alt: etiqueta,
                    class: "h-full w-full cursor-pointer rounded-2xl",
                    style: { background: "transparent", ["--poster-color" as string]: "transparent" },
                    ...(interactivo ? { "camera-controls": true } : {}),
                    "interaction-prompt": "none",
                    loading: interactivo ? "eager" : "lazy",
                    reveal: "auto",
                    // Animación suave de respaldo: si el modelo NO trae
                    // esqueleto (ni animaciones), la deriva del contenedor le
                    // da vida; si trae animación propia, se reproduce sola.
                    ...(clip && !reducir ? { autoplay: true } : {}),
                    ar: true,
                    "ar-modes": "webxr scene-viewer quick-look",
                } as Record<string, unknown>)}
            </div>
        </div>
    );
}
