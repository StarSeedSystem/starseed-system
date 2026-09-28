"use client";

/**
 * Hoja editable del documento en vivo: envuelve el `EditorDoc` de los mensajes (sin tocarlo) y
 * traduce entre su mundo (una lista de bloques sin id) y el del motor colaborativo (unidades con
 * id, clave de orden y sello):
 *
 *   · Al escribir: `alinearBloques` compara lo mostrado con lo que emite el editor y saca los
 *     cambios POR BLOQUE (editado, nacido con su clave, borrado).
 *   · Al llegar cambios de otras personas: se repinta la hoja conservando el cursor por ID de
 *     bloque (si alguien inserta un párrafo encima, tu cursor no salta de párrafo). Mientras
 *     escribes o compones una tilde, el repintado espera un respiro (~0,4 s).
 *   · Presencia: el bloque en el que está tu cursor viaja al canal; las marcas de los demás se
 *     pintan en una capa aparte (nunca dentro del contentEditable).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { EditorDoc } from "@/components/messages/rico/editor-doc";
import { aplicarRango, leerRango, normalizarDoc, type PosDoc } from "@/components/messages/rico/doc-dom";
import type { OpcionesCambio } from "@/components/messages/rico/historial";
import { cn } from "@/lib/utils";
import type { BloqueDoc, DocRico, EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { alinearBloques, type BloqueConId } from "@/lib/vivo/doc-colaborativo/alinear";
import { nuevoIdUnidad, type CambioUnidad, type UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import { igualesBloques } from "@/lib/vivo/documento";
import { MarcasPresencia } from "./marcas-presencia";
import styles from "./documento.module.css";

const ESPERA_REPINTADO_MS = 400;
const AREA: CSSProperties = { background: "transparent", boxShadow: "none", padding: "0 6px" };

export interface HojaEditableProps {
    unidades: UnidadColab<BloqueDoc>[];
    onCambios: (cambios: CambioUnidad<BloqueDoc>[], opciones?: OpcionesCambio) => void;
    onDeshacer: () => void;
    onRehacer: () => void;
    /** Bloque donde está el cursor (null = fuera del documento). */
    onFoco: (unidadId: string | null) => void;
    presentes: Presente[];
    estiloBase?: EstiloMensaje | null;
    etiqueta: string;
    /** Sube para repintar YA (deshacer, rehacer, restaurar una versión). */
    repintar?: number;
    /** Petición de salto desde el esquema. */
    irA?: { id: string; n: number } | null;
    className?: string;
}

function listaDe(unidades: UnidadColab<BloqueDoc>[]): BloqueConId<BloqueDoc>[] {
    return unidades.flatMap((u) => (u.datos ? [{ id: u.id, orden: u.orden, datos: u.datos }] : []));
}

function mismosIdsYDatos(a: BloqueConId<BloqueDoc>[], b: BloqueConId<BloqueDoc>[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i].id !== b[i].id) return false;
        if (a[i].datos !== b[i].datos && !igualesBloques(a[i].datos, b[i].datos)) return false;
    }
    return true;
}

function esParrafoVacio(b: BloqueDoc | undefined): boolean {
    return !!b && b.tipo === "parrafo" && !b.tramos.some((t) => t.texto);
}

interface CaretGuardado {
    inicioId: string | null;
    inicio: PosDoc;
    finId: string | null;
    fin: PosDoc;
}

export function HojaEditable({ unidades, onCambios, onDeshacer, onRehacer, onFoco, presentes, estiloBase, etiqueta, repintar = 0, irA, className }: HojaEditableProps) {
    const envoltorioRef = useRef<HTMLDivElement>(null);
    const mostradoRef = useRef<BloqueConId<BloqueDoc>[]>(listaDe(unidades));
    const [doc, setDoc] = useState<DocRico>(() => ({ bloques: mostradoRef.current.map((b) => b.datos) }));
    const [ids, setIds] = useState<string[]>(() => mostradoRef.current.map((b) => b.id));
    const [tic, setTic] = useState(0);
    const [aplazado, setAplazado] = useState(0);
    const ultimaEntrada = useRef(0);
    const componiendo = useRef(false);
    const caretPendiente = useRef<CaretGuardado | null>(null);
    const repintarVisto = useRef(repintar);
    const focoRef = useRef<string | null>(null);
    const onFocoRef = useRef(onFoco);
    onFocoRef.current = onFoco;

    const raizEditable = useCallback(() => envoltorioRef.current?.querySelector<HTMLElement>("[data-editor-doc]") ?? null, []);

    const fijarMostrado = useCallback((lista: BloqueConId<BloqueDoc>[]) => {
        mostradoRef.current = lista;
        setIds((prev) => (prev.length === lista.length && prev.every((id, i) => id === lista[i].id) ? prev : lista.map((b) => b.id)));
    }, []);

    // Llegan unidades nuevas (de otras personas, deshacer, restaurar…): repintar si hace falta.
    useEffect(() => {
        const lista = listaDe(unidades);
        const actual = mostradoRef.current;
        const forzar = repintar !== repintarVisto.current;
        repintarVisto.current = repintar;
        if (mismosIdsYDatos(lista, actual)) {
            // Mismo contenido; quizá cambió alguna clave de orden: se apunta sin repintar.
            if (lista.some((b, i) => b.orden !== actual[i].orden)) mostradoRef.current = lista.map((b, i) => ({ ...b, datos: actual[i].datos }));
            return;
        }
        if (!forzar && (componiendo.current || Date.now() - ultimaEntrada.current < ESPERA_REPINTADO_MS)) {
            const t = setTimeout(() => setAplazado((n) => n + 1), ESPERA_REPINTADO_MS + 20);
            return () => clearTimeout(t);
        }
        const raiz = raizEditable();
        if (raiz && raiz.ownerDocument.activeElement === raiz) {
            const r = leerRango(raiz);
            if (r) caretPendiente.current = { inicioId: actual[r.inicio.bloque]?.id ?? null, inicio: r.inicio, finId: actual[r.fin.bloque]?.id ?? null, fin: r.fin };
        }
        fijarMostrado(lista);
        setDoc({ bloques: lista.map((b) => b.datos) });
    }, [unidades, aplazado, repintar, raizEditable, fijarMostrado]);

    // Tras repintar, el cursor vuelve a SU bloque (por id), aunque haya cambiado de posición.
    useLayoutEffect(() => {
        const c = caretPendiente.current;
        caretPendiente.current = null;
        const raiz = raizEditable();
        if (c && raiz) {
            const lista = mostradoRef.current.map((b) => b.id);
            const bi = c.inicioId ? lista.indexOf(c.inicioId) : -1;
            const bf = c.finId ? lista.indexOf(c.finId) : -1;
            if (bi >= 0) aplicarRango(raiz, { inicio: { ...c.inicio, bloque: bi }, fin: bf >= 0 ? { ...c.fin, bloque: bf } : { ...c.inicio, bloque: bi } });
        }
        setTic((n) => n + 1);
    }, [doc, raizEditable]);

    const alCambiar = useCallback(
        (nuevo: DocRico, opciones?: OpcionesCambio) => {
            ultimaEntrada.current = Date.now();
            const nuevos = normalizarDoc(nuevo).bloques;
            const antes = mostradoRef.current;
            // El párrafo vacío que el editor pinta en un documento vacío no es un cambio.
            if (antes.length === 0 && nuevos.length === 1 && esParrafoVacio(nuevos[0])) return;
            const r = alinearBloques(antes, nuevos, igualesBloques, () => nuevoIdUnidad("b"));
            fijarMostrado(r.mostrado);
            if (r.cambios.length) onCambios(r.cambios, opciones);
            setTic((n) => n + 1);
        },
        [onCambios, fijarMostrado],
    );

    // El bloque del cursor → presencia.
    useEffect(() => {
        let marco = 0;
        let salida: ReturnType<typeof setTimeout> | null = null;
        const avisar = (id: string | null) => {
            if (focoRef.current === id) return;
            focoRef.current = id;
            onFocoRef.current(id);
        };
        const alSeleccionar = () => {
            cancelAnimationFrame(marco);
            marco = requestAnimationFrame(() => {
                const raiz = raizEditable();
                if (!raiz || raiz.ownerDocument.activeElement !== raiz) return;
                if (salida) clearTimeout(salida);
                const r = leerRango(raiz);
                if (r) avisar(mostradoRef.current[r.inicio.bloque]?.id ?? null);
            });
        };
        const alSalir = (e: FocusEvent) => {
            if (!(e.target as HTMLElement | null)?.hasAttribute?.("data-editor-doc")) return;
            if (salida) clearTimeout(salida);
            salida = setTimeout(() => avisar(null), 1500);
        };
        const alComponer = (e: CompositionEvent) => {
            componiendo.current = e.type === "compositionstart";
            if (e.type === "compositionend") ultimaEntrada.current = Date.now();
        };
        const env = envoltorioRef.current;
        document.addEventListener("selectionchange", alSeleccionar);
        env?.addEventListener("focusout", alSalir);
        env?.addEventListener("compositionstart", alComponer);
        env?.addEventListener("compositionend", alComponer);
        return () => {
            cancelAnimationFrame(marco);
            if (salida) clearTimeout(salida);
            document.removeEventListener("selectionchange", alSeleccionar);
            env?.removeEventListener("focusout", alSalir);
            env?.removeEventListener("compositionstart", alComponer);
            env?.removeEventListener("compositionend", alComponer);
        };
    }, [raizEditable]);

    // Salto desde el esquema: llevar a la vista y dejar el cursor al principio del título.
    useEffect(() => {
        if (!irA) return;
        const raiz = raizEditable();
        const idx = mostradoRef.current.findIndex((b) => b.id === irA.id);
        const el = idx >= 0 ? (raiz?.children[idx] as HTMLElement | undefined) : undefined;
        if (!raiz || !el) return;
        const reducido = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView?.({ block: "start", behavior: reducido ? "auto" : "smooth" });
        raiz.focus({ preventScroll: true });
        aplicarRango(raiz, { inicio: { bloque: idx, item: 0, off: 0 }, fin: { bloque: idx, item: 0, off: 0 } });
    }, [irA, raizEditable]);

    return (
        <div ref={envoltorioRef} className={cn(styles.hoja, "relative flex min-h-0 flex-col", className)} data-hoja-editable="">
            <EditorDoc
                doc={doc}
                onChange={alCambiar}
                onDeshacer={onDeshacer}
                onRehacer={onRehacer}
                estiloBase={estiloBase}
                placeholder="Empieza a escribir…"
                etiqueta={etiqueta}
                className="min-h-0 flex-1"
                estiloArea={AREA}
            />
            <MarcasPresencia contenedor={envoltorioRef} raiz={raizEditable} ids={ids} presentes={presentes} tic={tic} />
        </div>
    );
}
