"use client";

/**
 * IconoDock (Ola 1025U · V1b) — pinta un icono del dock con su DISEÑO: forma, fondo (color, degradado o
 * cristal líquido), glifo, color y brillo.
 *
 * Se usa como el `icon` de `DockItem` (ocupa todo el botón) y, con `VistaIcono`, a un tamaño fijo en el
 * editor y la galería. La tesela (forma + fondo + borde) es un SVG propio dibujado como `<img src="data:…">`
 * —un SVG en una imagen no ejecuta scripts ni carga nada—, y el glifo va encima: el Lucide del propio item
 * (sin cargar el catálogo), uno elegido (carga a demanda), un SVG saneado o una imagen pequeña.
 *
 * El botón del dock trae su propio fondo, anillo y barrido de brillo; una regla CSS con `:has()` los
 * neutraliza SOLO cuando el botón contiene un icono diseñado, y deja el foco de teclado y la marca
 * «estás aquí» visibles. Sin soporte de `:has()` el icono se ve igual, con el fondo del botón detrás.
 */

import { Suspense, lazy, memo, useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { DisenoIcono } from "@/lib/dock/iconos/modelo";
import { glifoSvgDataUrl, teselaDataUrl } from "@/lib/dock/iconos/render-svg";
import type { IconoLucide } from "./glifos-lucide";

const GlifoLucideElegido = lazy(() => import("./glifo-lucide-elegido"));

const CSS_ICONO_DOCK = `
button:has(> [data-icono-disenado]) {
  background: none !important;
  box-shadow: none !important;
  overflow: visible !important;
  border-radius: 28% !important;
}
button:has(> [data-icono-disenado][data-icono-forma="circulo"]) { border-radius: 9999px !important; }
button:has(> [data-icono-disenado])::before { display: none !important; }
button:has(> [data-icono-disenado]):focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.75) !important;
  outline-offset: 3px !important;
}
button[aria-current="page"] > [data-icono-disenado] {
  filter: drop-shadow(0 0 7px currentColor);
}
[data-icono-disenado] img { -webkit-user-drag: none; user-select: none; }
`;

/** El color con el alfa dado (los de 8 dígitos ya traen el suyo). */
function conAlfa(color: string, alfaHex: string): string {
    return color.length === 7 ? `${color}${alfaHex}` : color;
}

export interface IconoDockProps {
    diseno: DisenoIcono;
    /** El icono de Lucide propio del item: es el glifo cuando el diseño dice «auto» y el respaldo si otro falla. */
    icono: IconoLucide;
    /** Clave `iconKey` del item (para resolver un glifo «auto» elegido a mano). */
    iconKey?: string;
    className?: string;
}

function GlifoSvg({ svg, color }: { svg: string; color: string }) {
    const url = useMemo(() => glifoSvgDataUrl(svg, color), [svg, color]);
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" draggable={false} className="h-full w-full object-contain" />;
}

export const IconoDock = memo(function IconoDock({ diseno, icono: Propio, iconKey = "", className }: IconoDockProps) {
    const tesela = useMemo(() => (diseno.fondo.tipo === "ninguno" && !diseno.borde ? null : teselaDataUrl(diseno)), [diseno]);
    const lado = `${Math.round(diseno.escala * 1000) / 10}%`;
    const radio = Math.round(2 + diseno.brillo * 8);
    const estilo: CSSProperties = {
        width: lado,
        height: lado,
        color: diseno.colorGlifo,
        filter: diseno.brillo > 0 ? `drop-shadow(0 0 ${radio}px ${conAlfa(diseno.colorGlifo, "b3")})` : undefined,
    };
    const g = diseno.glifo;
    return (
        <>
            <style href="ss-iconos-dock" precedence="default">{CSS_ICONO_DOCK}</style>
            <span
                aria-hidden="true"
                data-icono-disenado=""
                data-icono-forma={diseno.forma}
                className={cn("pointer-events-none absolute inset-0 block", className)}
            >
                {tesela && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tesela} alt="" draggable={false} className="absolute inset-0 h-full w-full" />
                )}
                <span className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center" style={estilo}>
                    {g.tipo === "lucide" && g.clave === "auto" && <Propio className="h-full w-full" />}
                    {g.tipo === "lucide" && g.clave !== "auto" && (
                        <Suspense fallback={<Propio className="h-full w-full" />}>
                            <GlifoLucideElegido clave={g.clave} iconKeyPropio={iconKey} />
                        </Suspense>
                    )}
                    {g.tipo === "svg" && <GlifoSvg svg={g.svg} color={diseno.colorGlifo} />}
                    {g.tipo === "imagen" && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={g.src} alt="" draggable={false} className="h-full w-full rounded-[22%] object-cover" />
                    )}
                </span>
            </span>
        </>
    );
});

export interface VistaIconoProps extends IconoDockProps {
    /** Lado en px. */
    lado: number;
    /** Dibuja el icono sobre una «ranura» como la del dock (para que se vea en contexto). */
    sobreDock?: boolean;
}

/** El icono a un tamaño fijo (editor, galería, tarjetas). */
export function VistaIcono({ lado, sobreDock = false, ...props }: VistaIconoProps) {
    return (
        <span
            className={cn("relative inline-block shrink-0", sobreDock && "rounded-2xl bg-black/30 ring-1 ring-white/10")}
            style={sobreDock ? { width: lado + 16, height: lado + 16, padding: 8 } : { width: lado, height: lado }}
            data-vista-icono=""
        >
            <span className="relative block" style={{ width: lado, height: lado }}>
                <IconoDock {...props} />
            </span>
        </span>
    );
}
