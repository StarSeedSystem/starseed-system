'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Símbolo oficial en 3D real (ESC1110A)
// ----------------------------------------------------------------
// Muestra al instante la imagen prerenderizada de la misma escena
// (`/brand/starseed-simbolo-3d.webp`, 2×) y, si el aparato puede, carga
// en diferido el lienzo R3F (`next/dynamic`, sin SSR) y lo funde encima.
// La imagen se queda cuando no hay WebGL, si se pierde el contexto, con
// movimiento reducido en un aparato débil y en las pruebas.
// Ligero: lienzo del tamaño mostrado, DPR ≤ 2, `frameloop="demand"`, se
// pausa fuera de pantalla o con la pestaña oculta y libera todo al salir.
// Decorativo para lectores de pantalla salvo que se le dé `etiqueta`.
// ════════════════════════════════════════════════════════════════

import React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { decidirModoSimbolo, leerEntornoSimbolo, type ModoSimbolo } from "./simbolo-starseed-modo";

/** Imagen fija: render de la pose de reposo, 256 × 384 px (2× de 128 × 192). */
export const SIMBOLO_3D_FIJO = "/brand/starseed-simbolo-3d.webp";

const LienzoSimbolo = dynamic(() => import("./simbolo-starseed-lienzo"), { ssr: false, loading: () => null });

export interface SimboloStarSeed3DProps {
    /** Alto en px CSS (caja 2:3). Por defecto 192. */
    alto?: number;
    className?: string;
    /** Texto alternativo si el símbolo va solo; sin él es decorativo (aria-hidden). */
    etiqueta?: string;
}

export function SimboloStarSeed3D({ alto = 192, className, etiqueta }: SimboloStarSeed3DProps): React.ReactElement {
    const ancho = Math.round((alto * 2) / 3);
    const caja = React.useRef<HTMLDivElement>(null);
    const [modo, setModo] = React.useState<ModoSimbolo>("fijo");
    const [listo, setListo] = React.useState(false);
    const [visible, setVisible] = React.useState(true);

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

    const decorativo = !etiqueta;
    return (
        <div
            ref={caja}
            className={cn("relative shrink-0", className)}
            style={{ width: ancho, height: alto }}
            data-testid="simbolo-starseed-3d"
            data-modo={modo}
            role={decorativo ? undefined : "img"}
            aria-label={etiqueta}
            aria-hidden={decorativo ? true : undefined}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={SIMBOLO_3D_FIJO}
                alt=""
                width={ancho}
                height={alto}
                draggable={false}
                decoding="async"
                data-testid="simbolo-starseed-fijo"
                className="pointer-events-none absolute inset-0 size-full select-none transition-opacity duration-700"
                style={{ opacity: listo ? 0 : 1 }}
            />
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
                    />
                </div>
            )}
        </div>
    );
}

export default SimboloStarSeed3D;
