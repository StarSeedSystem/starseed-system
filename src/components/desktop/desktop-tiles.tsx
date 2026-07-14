'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Mosaico del escritorio (pantalla dividida) · Adenda 68 · B-3
// ----------------------------------------------------------------
// Divisores ARRASTRABLES sobre el mosaico del escritorio activo:
//   • Verticales  → reparten el ancho entre COLUMNAS (cualquier número).
//   • Horizontales→ reparten el alto entre las FILAS de una columna.
// El modelo (columnas → filas + fracciones) vive en desktop-store.ts
// (`DesktopTiling`), así que aquí solo hay geometría y gesto: se calcula
// el rect con `tiledRects()` y al soltar se escriben las fracciones con
// `setTileFractions()`. Persistente por escritorio y retrocompatible: un
// escritorio sin `tiling` no monta nada de esto.
// ════════════════════════════════════════════════════════════════

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { setTileFractions, type DesktopTiling } from "./desktop-store";

const MIN_FR = 0.08;
const HIT = 10; // grosor sensible del divisor (px)

interface DragState {
    kind: "col" | "row";
    /** Índice de columna (siempre) y de fila (solo kind 'row'). */
    col: number;
    index: number;
    startPx: number;
    /** Fracciones de la banda que se está repartiendo, al empezar. */
    base: number[];
    /** Tamaño total de la banda en px (ancho del área, o alto de la columna). */
    totalPx: number;
}

/**
 * Capa de divisores. Se dibuja ENCIMA de las ventanas del mosaico pero solo
 * captura el puntero en las franjas de los divisores (el resto es transparente
 * a los eventos), así que las ventanas siguen siendo plenamente interactivas.
 */
export function DesktopTileDividers({
    desktopId, tiling, area, accent,
}: {
    desktopId: string;
    tiling: DesktopTiling;
    /** Área útil del mosaico en px (misma que usa tiledRects). */
    area: { x: number; y: number; w: number; h: number };
    accent: string;
}): React.ReactElement | null {
    const [drag, setDrag] = useState<DragState | null>(null);
    const liveRef = useRef<number[] | null>(null);

    useEffect(() => {
        if (!drag) return;
        const onMove = (e: PointerEvent) => {
            const px = drag.kind === "col" ? e.clientX : e.clientY;
            const delta = (px - drag.startPx) / Math.max(1, drag.totalPx);
            const i = drag.index;
            const next = [...drag.base];
            const pair = next[i] + next[i + 1];
            const a = Math.min(Math.max(next[i] + delta, MIN_FR), pair - MIN_FR);
            next[i] = a;
            next[i + 1] = pair - a;
            liveRef.current = next;
            // Escritura optimista: el store es la única fuente de verdad y el
            // render del mosaico es puro → el arrastre se ve en vivo.
            if (drag.kind === "col") setTileFractions(desktopId, { colFr: next });
            else setTileFractions(desktopId, { rowFr: { col: drag.col, fr: next } });
        };
        const onUp = () => {
            liveRef.current = null;
            setDrag(null);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, [drag, desktopId]);

    if (tiling.cols.length === 0) return null;

    const handles: React.ReactElement[] = [];

    // ── Divisores VERTICALES (entre columnas) ──
    let cx = area.x;
    tiling.cols.forEach((col, i) => {
        const cw = area.w * (tiling.colFr[i] ?? 1 / tiling.cols.length);
        const colX = cx;
        cx += cw;
        if (i < tiling.cols.length - 1) {
            const active = drag?.kind === "col" && drag.index === i;
            handles.push(
                <div
                    key={`c-${i}`}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Divisor entre columna ${i + 1} y ${i + 2}`}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDrag({
                            kind: "col", col: i, index: i,
                            startPx: e.clientX,
                            base: [...tiling.colFr],
                            totalPx: area.w,
                        });
                    }}
                    style={{ left: cx - HIT / 2, top: area.y, width: HIT, height: area.h }}
                    className="pointer-events-auto absolute z-[3] cursor-ew-resize"
                >
                    <span
                        aria-hidden
                        className={cn(
                            "absolute inset-y-3 left-1/2 w-[2px] -translate-x-1/2 rounded-full transition-all duration-150",
                            active ? "opacity-100" : "opacity-0 hover:opacity-70",
                        )}
                        style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
                    />
                </div>,
            );
        }

        // ── Divisores HORIZONTALES (entre filas de ESTA columna) ──
        let cy = area.y;
        col.forEach((_, j) => {
            const rh = area.h * (tiling.rowFr[i]?.[j] ?? 1 / col.length);
            cy += rh;
            if (j < col.length - 1) {
                const active = drag?.kind === "row" && drag.col === i && drag.index === j;
                handles.push(
                    <div
                        key={`r-${i}-${j}`}
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Divisor entre las ventanas ${j + 1} y ${j + 2} de la columna ${i + 1}`}
                        onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDrag({
                                kind: "row", col: i, index: j,
                                startPx: e.clientY,
                                base: [...(tiling.rowFr[i] ?? [])],
                                totalPx: area.h,
                            });
                        }}
                        style={{ left: colX, top: cy - HIT / 2, width: cw, height: HIT }}
                        className="pointer-events-auto absolute z-[3] cursor-ns-resize"
                    >
                        <span
                            aria-hidden
                            className={cn(
                                "absolute inset-x-3 top-1/2 h-[2px] -translate-y-1/2 rounded-full transition-all duration-150",
                                active ? "opacity-100" : "opacity-0 hover:opacity-70",
                            )}
                            style={{ background: accent, boxShadow: `0 0 12px ${accent}` }}
                        />
                    </div>,
                );
            }
        });
    });

    return (
        <div className="pointer-events-none absolute inset-0 z-[30]" aria-label="Divisores del mosaico">
            {handles}
        </div>
    );
}
