"use client";

/**
 * Montaje del diseño de iconos del dock (Ola 1025U · V1b). Escucha los dos eventos que emite el menú de
 * mantener pulsado del dock y abre, A DEMANDA, el editor de un icono o la galería de plantillas:
 *
 *   · `starseed:dock-diseno-icono`  (detail: { itemId })  → editor del icono.
 *   · `starseed:dock-plantillas`                           → galería de plantillas.
 *
 * No carga nada hasta que alguien pide una de las dos cosas (los diálogos son `lazy`), así que montarlo
 * en el dock no pesa en el arranque. Si hay varias instancias montadas, solo la primera atiende (nunca
 * dos diálogos a la vez).
 */

import { Suspense, lazy, useEffect, useState } from "react";

export const EVENTO_DISENO_ICONO = "starseed:dock-diseno-icono";
export const EVENTO_PLANTILLAS_ICONOS = "starseed:dock-plantillas";

const EditorIconoPerezoso = lazy(() => import("./editor-icono").then((m) => ({ default: m.EditorIcono })));
const GaleriaPerezosa = lazy(() => import("./galeria-plantillas").then((m) => ({ default: m.GaleriaPlantillas })));

/** Instancias montadas: solo la primera viva atiende los eventos. */
const montados = new Set<symbol>();

/** Pide abrir el editor de un icono (para quien no use el menú del dock). */
export function abrirEditorIcono(itemId: string): void {
    try { window.dispatchEvent(new CustomEvent(EVENTO_DISENO_ICONO, { detail: { itemId } })); } catch { /* sin ventana */ }
}

/** Pide abrir la galería de plantillas de iconos. */
export function abrirPlantillasIconos(): void {
    try { window.dispatchEvent(new CustomEvent(EVENTO_PLANTILLAS_ICONOS)); } catch { /* sin ventana */ }
}

function leerItemId(detalle: unknown): string | null {
    const id = (detalle as { itemId?: unknown } | null)?.itemId;
    return typeof id === "string" && id.length > 0 && id.length <= 120 ? id : null;
}

export default function MontajeIconosDock() {
    const [editor, setEditor] = useState<{ itemId: string; n: number } | null>(null);
    const [editorAbierto, setEditorAbierto] = useState(false);
    const [galeria, setGaleria] = useState<{ n: number } | null>(null);
    const [galeriaAbierta, setGaleriaAbierta] = useState(false);

    useEffect(() => {
        const yo = Symbol("iconos-dock");
        montados.add(yo);
        const soyYo = () => montados.values().next().value === yo;
        const abrirEditor = (ev: Event) => {
            if (!soyYo()) return;
            const itemId = leerItemId((ev as CustomEvent).detail);
            if (!itemId) return;
            setEditor((e) => ({ itemId, n: (e?.n ?? 0) + 1 }));
            setEditorAbierto(true);
        };
        const abrirGaleria = () => {
            if (!soyYo()) return;
            setGaleria((g) => ({ n: (g?.n ?? 0) + 1 }));
            setGaleriaAbierta(true);
        };
        window.addEventListener(EVENTO_DISENO_ICONO, abrirEditor);
        window.addEventListener(EVENTO_PLANTILLAS_ICONOS, abrirGaleria);
        return () => {
            montados.delete(yo);
            window.removeEventListener(EVENTO_DISENO_ICONO, abrirEditor);
            window.removeEventListener(EVENTO_PLANTILLAS_ICONOS, abrirGaleria);
        };
    }, []);

    if (!editor && !galeria) return null;
    return (
        <Suspense fallback={null}>
            {editor && <EditorIconoPerezoso key={`${editor.itemId}-${editor.n}`} itemId={editor.itemId} abierto={editorAbierto} alCerrar={() => setEditorAbierto(false)} />}
            {galeria && <GaleriaPerezosa key={galeria.n} abierto={galeriaAbierta} alCerrar={() => setGaleriaAbierta(false)} />}
        </Suspense>
    );
}
