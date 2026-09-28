"use client";

/**
 * Render de solo lectura del texto enriquecido (C4): documento tipo Word (`DocRico`) o texto plano,
 * con las animaciones de letras. Nunca HTML crudo: cada tramo se pinta con elementos React
 * (strong, em, u, s, code, a) a partir del dato ya validado.
 *
 * Animación por letra: cada palabra va en un `span` sin cortes y cada grafema (Intl.Segmenter) en el
 * suyo con `--i` para escalonar. Más de `MAX_LETRAS_ANIMADAS` letras → animación de bloque (el DOM
 * no crece sin control). Los lectores de pantalla leen la palabra entera, no letra a letra.
 */
import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNivelMovimiento } from "@/hooks/use-nivel-movimiento";
import {
    alineacionCss,
    animacionPorLetra,
    claseAnimacionTexto,
    enlaceSeguro,
    fuenteCss,
    segmentarGrafemas,
    textoPlanoDeDoc,
    MAX_LETRAS_ANIMADAS,
} from "@/lib/mensajeria/formato";
import type { AnimacionTexto, BloqueDoc, DocRico, TramoTexto } from "@/lib/mensajeria/formato-tipos";
import styles from "./rico.module.css";

export type ModoAnimacion = "letras" | "bloque" | "ninguno";

interface ContextoAnim {
    modo: ModoAnimacion;
    contador: { n: number };
}

/** Letras visibles (sin espacios) de un texto; si es enorme ni se segmenta. */
export function contarLetras(texto: string): number {
    const sinEspacios = texto.replace(/\s+/g, "");
    if (sinEspacios.length > MAX_LETRAS_ANIMADAS * 4) return sinEspacios.length;
    return segmentarGrafemas(sinEspacios).length;
}

export function decidirModoAnimacion(anim: AnimacionTexto | undefined, letras: number, reducido: boolean): ModoAnimacion {
    if (!anim || anim === "ninguna" || reducido) return "ninguno";
    if (animacionPorLetra(anim) && letras <= MAX_LETRAS_ANIMADAS) return "letras";
    return "bloque";
}

/** Clases y variables CSS de la animación de un bloque de texto. */
export function propsAnimacion(
    anim: AnimacionTexto | undefined,
    modo: ModoAnimacion,
    letras: number,
    colorNeon?: string,
): { className: string; style: CSSProperties } {
    if (modo === "ninguno" || !anim) return { className: "", style: {} };
    const style: Record<string, string> = {};
    // Que la escritura entera dure como mucho ~1,6 s (aparecer) o ~2,8 s (máquina).
    if (anim === "aparecer") style["--rt-paso"] = `${Math.max(4, Math.min(28, 1600 / Math.max(1, letras)))}ms`;
    if (anim === "maquina") style["--rt-paso"] = `${Math.max(6, Math.min(45, 2800 / Math.max(1, letras)))}ms`;
    if (colorNeon) style["--rt-neon"] = colorNeon;
    return {
        className: cn(claseAnimacionTexto(anim), modo === "bloque" && "ss-rt-bloque"),
        style: style as CSSProperties,
    };
}

function textoConLetras(texto: string, ctx: ContextoAnim, clave: string): ReactNode {
    if (ctx.modo !== "letras") return texto;
    return texto.split(/(\s+)/).map((parte, k) => {
        if (!parte) return null;
        if (/^\s+$/.test(parte)) return <Fragment key={`${clave}-${k}`}>{parte}</Fragment>;
        const letras = segmentarGrafemas(parte).map((g, j) => (
            <span key={j} className="ss-rt-l" style={{ "--i": ctx.contador.n++ } as CSSProperties}>
                {g}
            </span>
        ));
        return (
            <span key={`${clave}-${k}`} className="ss-rt-p">
                <span aria-hidden="true">{letras}</span>
                <span className="sr-only select-none">{parte}</span>
            </span>
        );
    });
}

function renderTramo(t: TramoTexto, ctx: ContextoAnim, clave: string): ReactNode {
    let nodo: ReactNode = textoConLetras(t.texto, ctx, clave);
    const marcas = new Set(t.marcas ?? []);
    if (marcas.has("codigo")) nodo = <code>{nodo}</code>;
    if (marcas.has("tachado")) nodo = <s>{nodo}</s>;
    if (marcas.has("subrayado")) nodo = <u>{nodo}</u>;
    if (marcas.has("cursiva")) nodo = <em>{nodo}</em>;
    if (marcas.has("negrita")) nodo = <strong>{nodo}</strong>;
    const estilo: CSSProperties = {};
    if (t.color) estilo.color = t.color;
    if (t.resaltado) estilo.backgroundColor = t.resaltado;
    const familia = fuenteCss(t.fuente);
    if (familia) estilo.fontFamily = familia;
    if (t.tamano) estilo.fontSize = `${t.tamano}px`;
    if (Object.keys(estilo).length) {
        nodo = (
            <span style={estilo} className={t.resaltado ? styles.resaltado : undefined}>
                {nodo}
            </span>
        );
    }
    const enlace = t.enlace ? enlaceSeguro(t.enlace) : null;
    if (enlace) {
        nodo = enlace.startsWith("/") ? (
            <Link href={enlace}>{nodo}</Link>
        ) : (
            <a href={enlace} target="_blank" rel="noopener noreferrer nofollow ugc">
                {nodo}
            </a>
        );
    }
    return <Fragment key={clave}>{nodo}</Fragment>;
}

function renderTramos(tramos: TramoTexto[], ctx: ContextoAnim, clave: string): ReactNode {
    if (!tramos.length) return <br />;
    return tramos.map((t, i) => renderTramo(t, ctx, `${clave}.${i}`));
}

function renderBloque(b: BloqueDoc, ctx: ContextoAnim, i: number): ReactNode {
    const clave = `b${i}`;
    switch (b.tipo) {
        case "parrafo":
            return (
                <p key={clave} style={{ textAlign: alineacionCss(b.alineacion) }}>
                    {renderTramos(b.tramos, ctx, clave)}
                </p>
            );
        case "titulo": {
            const Etiqueta = (`h${b.nivel}` as "h1" | "h2" | "h3");
            return (
                <Etiqueta key={clave} style={{ textAlign: alineacionCss(b.alineacion) }}>
                    {renderTramos(b.tramos, ctx, clave)}
                </Etiqueta>
            );
        }
        case "lista": {
            const Lista = b.ordenada ? "ol" : "ul";
            return (
                <Lista key={clave}>
                    {b.items.map((it, j) => (
                        <li key={j}>{renderTramos(it, ctx, `${clave}.${j}`)}</li>
                    ))}
                </Lista>
            );
        }
        case "tareas":
            return (
                <ul key={clave} className={styles.tareas}>
                    {b.items.map((it, j) => (
                        <li key={j} className={styles.tarea}>
                            <span
                                className={cn(styles.casilla, it.hecha && styles.casillaHecha)}
                                role="img"
                                aria-label={it.hecha ? "Tarea hecha" : "Tarea pendiente"}
                            >
                                {it.hecha && <Check className="h-[0.75em] w-[0.75em]" strokeWidth={3.5} aria-hidden="true" />}
                            </span>
                            <span className={it.hecha ? styles.tareaHecha : undefined}>{renderTramos(it.tramos, ctx, `${clave}.${j}`)}</span>
                        </li>
                    ))}
                </ul>
            );
        case "cita":
            return <blockquote key={clave}>{renderTramos(b.tramos, ctx, clave)}</blockquote>;
        case "codigo":
            return (
                <pre key={clave} data-lenguaje={b.lenguaje}>
                    <code>{b.texto}</code>
                </pre>
            );
        case "separador":
            return <hr key={clave} />;
    }
}

export interface TextoRicoProps {
    /** Documento tipo Word; si falta se pinta `texto` (mensaje básico con estilo). */
    doc?: DocRico | null;
    texto?: string;
    animacion?: AnimacionTexto;
    /** Color del halo de la animación «neón». */
    colorNeon?: string;
    /** Fuerza quieto (miniaturas, editor). */
    estatico?: boolean;
    className?: string;
    style?: CSSProperties;
}

/** Texto (documento o plano) con su animación de letras; respeta movimiento reducido. */
export function TextoRico(props: TextoRicoProps) {
    // Sin animación no hace falta escuchar el nivel de movimiento (un chat largo pinta muchos).
    if (!props.animacion || props.animacion === "ninguna" || props.estatico) return <TextoRicoPintado {...props} reducido />;
    return <TextoRicoAnimado {...props} />;
}

function TextoRicoAnimado(props: TextoRicoProps) {
    const nivel = useNivelMovimiento();
    return <TextoRicoPintado {...props} reducido={nivel === "minimo"} />;
}

function TextoRicoPintado({ doc, texto = "", animacion, colorNeon, className, style, reducido }: TextoRicoProps & { reducido: boolean }) {
    const plano = useMemo(() => (doc ? textoPlanoDeDoc(doc) : texto), [doc, texto]);
    const letras = useMemo(() => (animacion && animacion !== "ninguna" ? contarLetras(plano) : 0), [animacion, plano]);
    const modo = decidirModoAnimacion(animacion, letras, reducido);
    const anim = propsAnimacion(animacion, modo, letras, colorNeon);
    const ctx: ContextoAnim = { modo, contador: { n: 0 } };
    return (
        <div
            className={cn(styles.raiz, doc ? styles.doc : styles.textoPlano, anim.className, className)}
            style={{ ...anim.style, ...style }}
            data-animacion={modo === "ninguno" ? undefined : `${animacion}:${modo}`}
        >
            {doc ? doc.bloques.map((b, i) => renderBloque(b, ctx, i)) : textoConLetras(texto, ctx, "t")}
        </div>
    );
}
