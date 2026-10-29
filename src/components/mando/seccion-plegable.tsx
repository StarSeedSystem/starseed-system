"use client";

/**
 * SeccionPlegable (UIG1029A): sección reutilizable de Genesis que se pliega a
 * una línea. Cabecera con título, contador y botón «Cerrar lista»/«Abrir lista»
 * (aria-expanded, aria-controls y teclado); cerrada enseña solo el resumen.
 * El estado se recuerda por id en localStorage con try/catch (funciona sin él).
 * La transición es `mc-desplegar`, que respeta prefers-reduced-motion.
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Evento de ventana por el que una zona plega o despliega todas sus secciones. */
const EVENTO_ZONA = "seccion-plegable:zona";
type AccionZona = "plegar" | "desplegar";
const CLAVE = (id: string) => `starseed.seccion-plegable.${id}`;

function accionDe(e: Event): AccionZona | null {
    const accion = (e as CustomEvent).detail?.accion;
    return accion === "plegar" || accion === "desplegar" ? accion : null;
}

/* Lo guardado por este id: true/false, o null si no hay nada (o localStorage falla). */
function leerGuardada(id: string): boolean | null {
    try {
        const v = window.localStorage.getItem(CLAVE(id));
        return v === "abierta" ? true : v === "cerrada" ? false : null;
    } catch { return null; }
}

export interface SeccionPlegableProps {
    id: string;
    titulo: string;
    resumen?: string;
    contador?: string;
    abiertaPorDefecto?: boolean;
    acciones?: ReactNode;
    children?: ReactNode;
}

/** Botón «Plegar todo / Desplegar todo»: avisa a todas las secciones de la zona. */
export function usePlegarTodo() {
    const [plegado, setPlegado] = useState(false);
    const plegadoRef = useRef(plegado);
    plegadoRef.current = plegado;
    // Si otra zona (u otro botón) plega, la etiqueta cambia también.
    useEffect(() => {
        const alAviso = (e: Event) => {
            const accion = accionDe(e);
            if (accion) setPlegado(accion === "plegar");
        };
        window.addEventListener(EVENTO_ZONA, alAviso);
        return () => window.removeEventListener(EVENTO_ZONA, alAviso);
    }, []);
    const alternar = useCallback(() => {
        const siguiente: AccionZona = plegadoRef.current ? "desplegar" : "plegar";
        window.dispatchEvent(new CustomEvent(EVENTO_ZONA, { detail: { accion: siguiente } }));
        setPlegado(siguiente === "plegar");
    }, []);
    return { plegado, etiqueta: plegado ? "Desplegar todo" : "Plegar todo", alternar };
}

export function SeccionPlegable({
    id,
    titulo,
    resumen,
    contador,
    abiertaPorDefecto = true,
    acciones,
    children,
}: SeccionPlegableProps) {
    const [abierta, setAbierta] = useState(abiertaPorDefecto);
    const abiertaRef = useRef(abierta);
    abiertaRef.current = abierta;
    const recordar = useCallback((v: boolean) => {
        try { window.localStorage.setItem(CLAVE(id), v ? "abierta" : "cerrada"); } catch { /* sin localStorage */ }
    }, [id]);
    const alternar = useCallback(() => {
        const siguiente = !abiertaRef.current;
        setAbierta(siguiente);
        recordar(siguiente);
    }, [recordar]);
    // Al montar (y si cambia el id) se recupera lo recordado; el defecto si no hay nada.
    useEffect(() => {
        setAbierta(leerGuardada(id) ?? abiertaPorDefecto);
    }, [id, abiertaPorDefecto]);
    // Un aviso de zona (Plegar todo / Desplegar todo) manda sobre el estado propio.
    useEffect(() => {
        const alAviso = (e: Event) => {
            const accion = accionDe(e);
            if (accion) {
                setAbierta(accion === "desplegar");
                recordar(accion === "desplegar");
            }
        };
        window.addEventListener(EVENTO_ZONA, alAviso);
        return () => window.removeEventListener(EVENTO_ZONA, alAviso);
    }, [recordar]);

    const contenidoId = `${id}-contenido`;
    return (
        <section className="mc-cristal w-full p-3" aria-label={titulo}>
            <header className="flex flex-wrap items-center justify-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{titulo}</h3>
                {contador ? <span className="text-[11px] tabular-nums text-white/45">{contador}</span> : null}
                {acciones ? <span className="flex flex-wrap items-center justify-center gap-1.5">{acciones}</span> : null}
                <button type="button" onClick={alternar} aria-expanded={abierta} aria-controls={contenidoId} className="mc-alzar ml-2 inline-flex cursor-pointer items-center gap-1 rounded-md border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100">
                    {abierta ? "Cerrar lista" : "Abrir lista"}
                    <ChevronDown aria-hidden className={`h-3 w-3 transition-transform duration-200 ${abierta ? "rotate-180" : ""}`} />
                </button>
            </header>
            {!abierta && resumen ? <p className="mc-centrado mt-1 truncate text-[10px] text-white/45">{resumen}</p> : null}
            {abierta ? <div id={contenidoId} className="mc-desplegar mt-2">{children}</div> : null}
        </section>
    );
}
