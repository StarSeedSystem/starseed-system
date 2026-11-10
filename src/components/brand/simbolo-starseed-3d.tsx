'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Símbolo oficial en 3D real (ESC1110A · ESC1110B)
// ----------------------------------------------------------------
// Muestra al instante la imagen prerenderizada de la misma escena y, si el
// aparato puede, carga en diferido el lienzo R3F (`next/dynamic`, sin SSR)
// y lo funde encima. La imagen se queda cuando no hay WebGL, si se pierde
// el contexto, con movimiento reducido en un aparato débil y en las pruebas.
// Ligero: lienzo del tamaño mostrado, DPR ≤ 2, `frameloop="demand"`, se
// pausa fuera de pantalla o con la pestaña oculta y libera todo al salir.
// Decorativo para lectores de pantalla salvo que se le dé `etiqueta`.
//
// ESC1110B, con `conFlor`: la Flor de la Vida fundida detrás (en la misma
// escena; el lienzo desborda la caja 2:3, que sigue midiendo lo mismo en
// el maquetado). Con `interactivo`: el ojo sigue al puntero por todo el
// escritorio (o mira adonde se toca), parpadea con cada clic o toque, y la
// flor se puede girar arrastrando (con inercia) o con las flechas del
// teclado; se asienta cada 60°. Con `archivo`: pinta ese archivo de símbolo.
// ════════════════════════════════════════════════════════════════

import React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { decidirModoSimbolo, leerEntornoSimbolo, type ModoSimbolo } from "./simbolo-starseed-modo";
import { CIRCULOS, CENTRO_PX, PROPORCION, REFERENCIA } from "./simbolo-starseed-medidas";
import { RADIO_ENVOLVENTE } from "./simbolo-flor";
import { esClic } from "./simbolo-ojo";
import { SIMBOLO_OFICIAL, type ArchivoSimbolo } from "./simbolo-archivo";
import { crearControlSimbolo, type ControlSimbolo } from "./simbolo-control";

/** Imagen fija: render de la pose de reposo, 256 × 384 px (2× de 128 × 192). */
export const SIMBOLO_3D_FIJO = "/brand/starseed-simbolo-3d.webp";
/** ESC1110B: imagen fija del símbolo fundido con la flor (2×, cuadrada, centrada en la flor). */
export const SIMBOLO_3D_FLOR_FIJO = "/brand/starseed-simbolo-flor-3d.webp";
/** ESC1110B: lado del encuadre con flor, en unidades del modelo (igual que `encuadreSimbolo(true).lado`). */
export const LADO_FLOR_UNIDADES = 2 * (RADIO_ENVOLVENTE + 0.12);

const LienzoSimbolo = dynamic(() => import("./simbolo-starseed-lienzo"), { ssr: false, loading: () => null });

export interface SimboloStarSeed3DProps {
    /** Alto en px CSS (caja 2:3). Por defecto 192. */
    alto?: number;
    className?: string;
    /** Texto alternativo si el símbolo va solo; sin él es decorativo (aria-hidden). */
    etiqueta?: string;
    /** ESC1110B: la Flor de la Vida fundida detrás del símbolo. */
    conFlor?: boolean;
    /** ESC1110B: mirada, parpadeo y flor giratoria (teclado y arrastre). */
    interactivo?: boolean;
    /** ESC1110B: el archivo de símbolo a pintar (por defecto, el oficial). */
    archivo?: ArchivoSimbolo;
    /** ESC1110B: aviso si un símbolo propio no se pudo cargar (se pinta el oficial). */
    onErrorModelo?: (motivo: string) => void;
}

/** Geometría del marco con flor dentro de la caja del símbolo (px CSS). Pura. */
export function marcoConFlor(alto: number): { lado: number; izquierda: number; arriba: number; pxPorUnidad: number; ojoY: number } {
    const pxPorUnidad = alto / PROPORCION;
    const lado = LADO_FLOR_UNIDADES * pxPorUnidad;
    const ancho = (alto * 2) / 3;
    const centroY = (CIRCULOS.inferior.cy / REFERENCIA.alto) * alto;
    return { lado, izquierda: ancho / 2 - lado / 2, arriba: centroY - lado / 2, pxPorUnidad, ojoY: (CENTRO_PX.y / REFERENCIA.alto) * alto };
}

export function SimboloStarSeed3D({
    alto = 192, className, etiqueta, conFlor = false, interactivo = false, archivo = SIMBOLO_OFICIAL, onErrorModelo,
}: SimboloStarSeed3DProps): React.ReactElement {
    const ancho = Math.round((alto * 2) / 3);
    const caja = React.useRef<HTMLDivElement>(null);
    const zona = React.useRef<HTMLDivElement>(null);
    const [modo, setModo] = React.useState<ModoSimbolo>("fijo");
    const [listo, setListo] = React.useState(false);
    const [visible, setVisible] = React.useState(true);
    const [reposoFlor, setReposoFlor] = React.useState(0);
    const oficial = archivo.fuente.tipo === "oficial";

    // Decide en el cliente (tras montar) si vale la pena el 3D en vivo.
    React.useEffect(() => {
        setModo(decidirModoSimbolo(leerEntornoSimbolo()));
        let consulta: MediaQueryList | null = null;
        const alCambiar = () => setModo(decidirModoSimbolo(leerEntornoSimbolo()));
        try {
            consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
            consulta.addEventListener?.("change", alCambiar);
        } catch { /* sin matchMedia */ }
        return () => consulta?.removeEventListener?.("change", alCambiar);
    }, []);

    // Pausa fuera de pantalla o con la pestaña oculta.
    React.useEffect(() => {
        if (modo === "fijo") return;
        const nodo = caja.current;
        let enPantalla = true;
        const actualizar = () => setVisible(enPantalla && !document.hidden);
        let obs: IntersectionObserver | null = null;
        if (nodo && typeof IntersectionObserver !== "undefined") {
            obs = new IntersectionObserver(([e]) => { enPantalla = !!e?.isIntersecting; actualizar(); });
            obs.observe(nodo);
        }
        document.addEventListener("visibilitychange", actualizar);
        return () => {
            obs?.disconnect();
            document.removeEventListener("visibilitychange", actualizar);
        };
    }, [modo]);

    const alPerderContexto = React.useCallback(() => {
        setListo(false);
        setModo("fijo");
    }, []);

    // ESC1110B: un control por archivo y modo (mirada, parpadeo, flor).
    const control = React.useMemo<ControlSimbolo | null>(
        () => (modo === "fijo" || !interactivo ? null : crearControlSimbolo(archivo, { reducido: modo === "quieto", ahoraMs: typeof performance !== "undefined" ? performance.now() : 0 })),
        [modo, interactivo, archivo],
    );

    // ESC1110B: el ojo mira al puntero en TODO el escritorio y parpadea con cada clic o toque.
    React.useEffect(() => {
        if (!control) return;
        let inicio: { x: number; y: number } | null = null;
        const centroOjo = () => {
            const r = caja.current?.getBoundingClientRect();
            return r ? { x: r.left + r.width / 2, y: r.top + (CENTRO_PX.y / REFERENCIA.alto) * r.height } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        };
        const mirar = (x: number, y: number) => {
            const c = centroOjo();
            control.mirar(x - c.x, y - c.y, Math.max(160, Math.min(window.innerWidth, window.innerHeight) * 0.35), performance.now());
            control.inclinar((x - c.x) / (window.innerWidth / 2), -(y - c.y) / (window.innerHeight / 2));
        };
        const mover = (e: PointerEvent) => { if (e.pointerType === "mouse" || inicio) mirar(e.clientX, e.clientY); };
        const bajar = (e: PointerEvent) => {
            inicio = { x: e.clientX, y: e.clientY };
            mirar(e.clientX, e.clientY); // en táctil, mira adonde se toca
        };
        const subir = (e: PointerEvent) => {
            if (inicio && esClic(e.clientX - inicio.x, e.clientY - inicio.y)) control.parpadear(performance.now());
            inicio = null;
        };
        const cancelar = () => { inicio = null; };
        window.addEventListener("pointermove", mover, { passive: true });
        window.addEventListener("pointerdown", bajar, { passive: true });
        window.addEventListener("pointerup", subir, { passive: true });
        window.addEventListener("pointercancel", cancelar, { passive: true });
        return () => {
            window.removeEventListener("pointermove", mover);
            window.removeEventListener("pointerdown", bajar);
            window.removeEventListener("pointerup", subir);
            window.removeEventListener("pointercancel", cancelar);
        };
    }, [control]);

    // ESC1110B: girar la flor arrastrando (alrededor de su centro en pantalla).
    const arrastre = React.useRef<{ id: number; angulo: number; t: number } | null>(null);
    const anguloEn = (x: number, y: number) => {
        const r = zona.current?.getBoundingClientRect();
        if (!r) return 0;
        return Math.atan2(y - (r.top + r.height / 2), x - (r.left + r.width / 2));
    };
    const alBajarFlor = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!control) return;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
        arrastre.current = { id: e.pointerId, angulo: anguloEn(e.clientX, e.clientY), t: performance.now() };
    };
    const alMoverFlor = (e: React.PointerEvent<HTMLDivElement>) => {
        const a = arrastre.current;
        if (!control || !a || a.id !== e.pointerId) return;
        const ang = anguloEn(e.clientX, e.clientY);
        let delta = ang - a.angulo;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        const ahora = performance.now();
        // En pantalla y crece hacia abajo: un giro horario en pantalla es negativo en el modelo.
        control.arrastrar(-delta, Math.max(0.001, (ahora - a.t) / 1000));
        arrastre.current = { id: a.id, angulo: ang, t: ahora };
    };
    const alSoltarFlor = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!control || arrastre.current?.id !== e.pointerId) return;
        arrastre.current = null;
        control.soltar();
        setTimeout(() => setReposoFlor(control.flor().reposo), 900);
    };
    const alTeclaFlor = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (!control) return;
        const sentido = e.key === "ArrowRight" || e.key === "ArrowDown" ? -1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? 1 : 0;
        if (!sentido) return;
        e.preventDefault();
        control.teclado(sentido);
        // El índice anunciado: la posición a la que va (0–5, en pasos de 60°).
        setReposoFlor((r) => (((r + sentido) % 6) + 6) % 6);
    };

    const decorativo = !etiqueta;
    const m = conFlor ? marcoConFlor(alto) : null;
    const fijoSrc = conFlor ? SIMBOLO_3D_FLOR_FIJO : SIMBOLO_3D_FIJO;
    // Un símbolo propio en modo fijo (sin WebGL): su SVG o imagen en la caja; nunca la marca oficial en su lugar.
    const fijoPropio = !oficial && (archivo.fuente.tipo === "svg"
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(archivo.fuente.datos)}`
        : archivo.fuente.tipo === "imagen" ? archivo.fuente.datos : null);
    const flor = conFlor && archivo.comportamientos.fusionFlor;
    const zonaInteractiva = interactivo && conFlor && flor && modo !== "fijo";
    return (
        <div
            ref={caja}
            className={cn("relative shrink-0", className)}
            style={{ width: ancho, height: alto }}
            data-testid="simbolo-starseed-3d"
            data-modo={modo}
            data-flor={conFlor ? "si" : undefined}
            data-propio={oficial ? undefined : "si"}
            role={decorativo ? undefined : "img"}
            aria-label={etiqueta}
            aria-hidden={decorativo && !zonaInteractiva ? true : undefined}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute"
                style={m ? { left: m.izquierda, top: m.arriba, width: m.lado, height: m.lado } : { inset: 0 }}
                data-testid="simbolo-starseed-marco"
            >
                {(oficial || !fijoPropio) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={fijoSrc}
                        alt=""
                        width={m ? Math.round(m.lado) : ancho}
                        height={m ? Math.round(m.lado) : alto}
                        draggable={false}
                        decoding="async"
                        data-testid="simbolo-starseed-fijo"
                        className="pointer-events-none absolute inset-0 size-full select-none transition-opacity duration-700"
                        style={{ opacity: listo || !oficial ? 0 : 1 }}
                    />
                )}
                {modo !== "fijo" && (
                    <div
                        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
                        style={{ opacity: listo ? 1 : 0 }}
                    >
                        <LienzoSimbolo
                            activo={visible}
                            quieto={modo === "quieto"}
                            onListo={() => setListo(true)}
                            onContextoPerdido={alPerderContexto}
                            conFlor={conFlor}
                            archivo={archivo}
                            control={control ?? undefined}
                            onErrorModelo={onErrorModelo}
                        />
                    </div>
                )}
            </div>
            {modo === "fijo" && fijoPropio && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fijoPropio} alt="" aria-hidden draggable={false} data-testid="simbolo-propio-fijo" className="pointer-events-none absolute inset-0 size-full select-none object-contain" />
            )}
            {zonaInteractiva && m && (
                <div
                    ref={zona}
                    role="slider"
                    tabIndex={0}
                    aria-label="Flor de la vida: gírala con las flechas o arrastrando"
                    aria-valuemin={0}
                    aria-valuemax={300}
                    aria-valuenow={reposoFlor * 60}
                    aria-valuetext={`${reposoFlor * 60} grados`}
                    data-testid="simbolo-flor-zona"
                    onPointerDown={alBajarFlor}
                    onPointerMove={alMoverFlor}
                    onPointerUp={alSoltarFlor}
                    onPointerCancel={alSoltarFlor}
                    onKeyDown={alTeclaFlor}
                    className="absolute z-0 cursor-grab rounded-full outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 active:cursor-grabbing"
                    style={{
                        left: m.izquierda + m.lado / 2 - RADIO_ENVOLVENTE * m.pxPorUnidad,
                        top: m.arriba + m.lado / 2 - RADIO_ENVOLVENTE * m.pxPorUnidad,
                        width: 2 * RADIO_ENVOLVENTE * m.pxPorUnidad,
                        height: 2 * RADIO_ENVOLVENTE * m.pxPorUnidad,
                        touchAction: "none",
                    }}
                />
            )}
        </div>
    );
}

export default SimboloStarSeed3D;
