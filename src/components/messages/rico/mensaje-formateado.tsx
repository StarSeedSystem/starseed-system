"use client";

/**
 * MensajeFormateado (contrato C4) — pinta un mensaje enriquecido dentro de la burbuja del chat.
 *
 *  · estilo: fuente, tamaño, color, marco, fondo (preset o color), alineación y animaciones.
 *  · doc: texto tipo Word (títulos, listas, tareas, citas, código, enlaces…).
 *  · lienzo: composición libre (fotos, vídeo, ventanas web, apps del OS, apps en vivo…).
 *
 * El formato se vuelve a validar aquí (llega de la base de datos y lo puede haber escrito cualquier
 * cliente): si no pasa, se enseña el texto plano de siempre y nada más. Con fondo o marco, el
 * componente dibuja su propia superficie; sin ellos, se funde con la burbuja que lo contiene.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { colorTextoSobre, docVacio, estiloACss, validarFormato } from "@/lib/mensajeria/formato";
import type { FormatoMensaje } from "@/lib/mensajeria/formato-tipos";
import { TextoRico } from "./render-doc";
import { CapaFondoAnimado, LienzoMensaje } from "./render-lienzo";
import styles from "./rico.module.css";

export interface MensajeFormateadoProps {
    formato: FormatoMensaje;
    /** Texto plano equivalente (`body`): se usa si el formato no trae documento y como reserva. */
    textoPlano: string;
    mio: boolean;
    /** Abre el visor grande (el chat decide cómo). */
    onAbrir?: () => void;
    /** «ampliado» = visor grande: el lienzo ocupa más pantalla. Por defecto, burbuja. */
    variante?: "burbuja" | "ampliado";
    className?: string;
}

/**
 * ¿El mensaje pinta su propia superficie (fondo, marco o fondo animado)? Si es así, el chat debería
 * mostrarlo sin el fondo ni el relleno de su burbuja por defecto para no dibujar dos marcos.
 */
export function superficiePropia(formato: FormatoMensaje | null | undefined): boolean {
    const e = formato?.estilo;
    return !!(e && (e.fondo || e.colorMarco || (e.grosorMarco ?? 0) > 0 || e.animacionFondo));
}

export function MensajeFormateado({ formato, textoPlano, mio, onAbrir, variante = "burbuja", className }: MensajeFormateadoProps) {
    const resultado = useMemo(() => validarFormato(formato), [formato]);

    if (!resultado.ok) {
        return <p className={cn(styles.textoPlano, "break-words", className)}>{textoPlano}</p>;
    }

    const f = resultado.formato;
    const estilo = f.estilo;
    const css = estiloACss(estilo);
    const conSuperficie = superficiePropia(f);
    const colorTexto = css.color ?? colorTextoSobre(estilo?.fondo);
    const hayDoc = !!f.doc && !docVacio(f.doc);
    const hayLienzo = !!f.lienzo && f.lienzo.elementos.length > 0;
    const ampliado = variante === "ampliado";

    return (
        <div
            className={cn(styles.raiz, conSuperficie && styles.superficie, className)}
            style={{ ...css, color: colorTexto }}
            data-mensaje-rico=""
            data-mio={mio ? "1" : undefined}
        >
            <CapaFondoAnimado tipo={estilo?.animacionFondo} />
            <div className={styles.contenido}>
                {hayDoc ? (
                    <TextoRico doc={f.doc} animacion={estilo?.animacionTexto} colorNeon={colorTexto ?? estilo?.colorMarco ?? "#7c5cff"} />
                ) : !hayLienzo ? (
                    <TextoRico texto={textoPlano} animacion={estilo?.animacionTexto} colorNeon={colorTexto ?? estilo?.colorMarco ?? "#7c5cff"} />
                ) : null}
                {hayLienzo && f.lienzo && (
                    <LienzoMensaje
                        lienzo={f.lienzo}
                        estiloBase={estilo}
                        mio={mio}
                        onAbrir={onAbrir}
                        anchoMax={ampliado ? 1100 : 440}
                        altoMax={ampliado ? 820 : 520}
                        anchoVw={ampliado ? 92 : 72}
                    />
                )}
            </div>
        </div>
    );
}

export default MensajeFormateado;
