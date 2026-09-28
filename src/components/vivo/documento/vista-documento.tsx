"use client";

/**
 * Vista de solo lectura del documento en vivo (quien entra con permiso de «ver»): la misma hoja,
 * pintada con `TextoRico` (React, sin HTML crudo) y con las marcas de quién está escribiendo dónde.
 */

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { TextoRico } from "@/components/messages/rico/render-doc";
import { estiloACss } from "@/lib/mensajeria/formato";
import type { BloqueDoc, EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";
import type { UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import { docDeUnidades } from "@/lib/vivo/documento";
import { MarcasPresencia } from "./marcas-presencia";
import styles from "./documento.module.css";

export interface VistaDocumentoProps {
    unidades: UnidadColab<BloqueDoc>[];
    /** Versión de la instantánea (para recolocar las marcas de presencia). */
    version?: number;
    presentes: Presente[];
    estiloBase?: EstiloMensaje | null;
    irA?: { id: string; n: number } | null;
    className?: string;
}

export function VistaDocumento({ unidades, version = 0, presentes, estiloBase, irA, className }: VistaDocumentoProps) {
    const contenedor = useRef<HTMLDivElement>(null);
    const area = useRef<HTMLDivElement>(null);
    const raiz = () => area.current?.querySelector<HTMLElement>("[data-lectura-doc] > div") ?? null;
    const ids = useMemo(() => unidades.map((u) => u.id), [unidades]);
    const css: CSSProperties = estiloACss(estiloBase ? { fuente: estiloBase.fuente, tamano: estiloBase.tamano } : null);

    useEffect(() => {
        if (!irA) return;
        const idx = unidades.findIndex((u) => u.id === irA.id);
        const el = idx >= 0 ? (raiz()?.children[idx] as HTMLElement | undefined) : undefined;
        el?.scrollIntoView?.({ block: "start", behavior: "smooth" });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [irA]);

    const vacio = unidades.length === 0;
    return (
        <div ref={contenedor} className={cn("relative flex min-h-0 flex-col", className)}>
            <div ref={area} className="min-h-0 flex-1 overflow-y-auto px-1.5" tabIndex={0} aria-label="Documento (solo lectura)">
                <div className={styles.hojaLectura} style={css} data-lectura-doc="">
                    {vacio ? (
                        <div>
                            <p className="text-white/50">Este documento aún está vacío. Cuando alguien escriba, lo verás aparecer aquí al momento.</p>
                        </div>
                    ) : (
                        <TextoRico doc={docDeUnidades(unidades)} estatico />
                    )}
                </div>
            </div>
            <MarcasPresencia contenedor={contenedor} raiz={raiz} area={() => area.current} ids={ids} presentes={presentes} tic={version} />
        </div>
    );
}
