"use client";

/**
 * Marcas de presencia sobre la hoja: una barrita del color de cada persona junto al bloque en el
 * que está escribiendo, con su nombre. Se pinta FUERA del contentEditable (una capa encima), así
 * el editor nunca lee ni guarda estas marcas.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import styles from "./documento.module.css";

interface Marca {
    unidad: string;
    top: number;
    height: number;
    left: number;
    personas: { clave: string; nombre: string; color: string }[];
}

interface Capa {
    top: number;
    left: number;
    width: number;
    height: number;
}

export interface MarcasPresenciaProps {
    /** Contenedor posicionado (relative) donde se dibuja la capa. */
    contenedor: RefObject<HTMLElement | null>;
    /** El elemento cuyos hijos son los bloques, en orden. */
    raiz: () => HTMLElement | null;
    /** Área visible que recorta (el que hace scroll). Por defecto, el padre de la raíz. */
    area?: () => HTMLElement | null;
    ids: string[];
    presentes: Presente[];
    /** Sube cuando cambia el contenido (para recolocar). */
    tic: number;
}

export function MarcasPresencia({ contenedor, raiz, area, ids, presentes, tic }: MarcasPresenciaProps) {
    const [capa, setCapa] = useState<Capa | null>(null);
    const [marcas, setMarcas] = useState<Marca[]>([]);
    const marco = useRef(0);
    const datos = useRef({ raiz, area, ids, presentes });
    datos.current = { raiz, area, ids, presentes };

    const medir = useCallback(() => {
        cancelAnimationFrame(marco.current);
        marco.current = requestAnimationFrame(() => {
            const cont = contenedor.current;
            const { raiz: r0, area: a0, ids: lista, presentes: gente } = datos.current;
            const r = r0();
            const a = a0?.() ?? r?.parentElement ?? null;
            if (!cont || !r || !a) {
                setCapa(null);
                setMarcas([]);
                return;
            }
            const cr = cont.getBoundingClientRect();
            const ar = a.getBoundingClientRect();
            const nueva: Capa = { top: ar.top - cr.top, left: ar.left - cr.left, width: ar.width, height: ar.height };
            setCapa((prev) => (prev && prev.top === nueva.top && prev.left === nueva.left && prev.width === nueva.width && prev.height === nueva.height ? prev : nueva));
            const porUnidad = new Map<string, Marca>();
            for (const p of gente) {
                if (!p.unidad) continue;
                const idx = lista.indexOf(p.unidad);
                const el = idx >= 0 ? (r.children[idx] as HTMLElement | undefined) : undefined;
                if (!el) continue;
                const er = el.getBoundingClientRect();
                const m = porUnidad.get(p.unidad) ?? { unidad: p.unidad, top: er.top - ar.top, height: Math.max(18, er.height), left: Math.max(2, er.left - ar.left - 14), personas: [] };
                if (!m.personas.some((x) => x.nombre === p.nombre && x.color === p.color)) m.personas.push({ clave: p.clave, nombre: p.nombre, color: p.color });
                porUnidad.set(p.unidad, m);
            }
            const lista2 = [...porUnidad.values()];
            // Sin cambios, sin repintado (nunca un bucle de medir → pintar → medir).
            setMarcas((prev) => (JSON.stringify(prev) === JSON.stringify(lista2) ? prev : lista2));
        });
    }, [contenedor]);

    useLayoutEffect(() => {
        medir();
    }, [medir, tic, ids, presentes]);

    useEffect(() => {
        const cont = contenedor.current;
        if (!cont) return;
        cont.addEventListener("scroll", medir, true);
        window.addEventListener("resize", medir);
        let obs: ResizeObserver | null = null;
        const r = raiz();
        if (r && typeof ResizeObserver !== "undefined") {
            obs = new ResizeObserver(medir);
            obs.observe(r);
        }
        return () => {
            cancelAnimationFrame(marco.current);
            cont.removeEventListener("scroll", medir, true);
            window.removeEventListener("resize", medir);
            obs?.disconnect();
        };
        // `raiz` apunta siempre al mismo elemento mientras la hoja está montada.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contenedor, medir]);

    if (!capa || !marcas.length) return null;
    return (
        <div className={styles.capaPresencia} style={{ top: capa.top, left: capa.left, width: capa.width, height: capa.height }} aria-hidden="true" data-marcas-presencia="">
            {marcas.map((m) => {
                const visible = m.top + m.height > 0 && m.top < capa.height;
                if (!visible) return null;
                const color = m.personas[0].color;
                return (
                    <div key={m.unidad} className={styles.marca} style={{ top: m.top, height: m.height, left: m.left, background: color, boxShadow: `0 0 12px ${color}88` }}>
                        <div className={styles.rotuloMarca}>
                            {m.personas.slice(0, 3).map((p) => (
                                <span key={p.clave} style={{ background: p.color }}>
                                    {p.nombre}
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
