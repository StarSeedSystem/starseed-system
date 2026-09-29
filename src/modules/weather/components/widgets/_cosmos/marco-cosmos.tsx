"use client";
/**
 * Armazón de los widgets del clima espacial: cabecera con icono, título y menú (actualizar y
 * abrir /atmosphere), estados honestos por fuente y el sello «NOAA SWPC» con su hora.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import type { EstadoFuente } from "@/modules/weather/datos/hooks";
import { CargandoClima, ErrorClima, MenuClima, RotuloClima, type AccionExtra, type InfoMarco } from "../_clima/piezas";

export const RUTA_COSMOS = "/atmosphere";

/** Qué pintar mientras una fuente no tiene dato: leyendo, o el error con reintento. */
export function estadoCosmos<T>(f: EstadoFuente<T>, info: InfoMarco, texto = "Escuchando al Sol…"): React.ReactNode | null {
    if (f.datos) return null;
    if (f.error) return <ErrorClima mensaje={`NOAA SWPC: ${f.error.toLowerCase()}`} onReintentar={f.refrescar} />;
    return <CargandoClima base={info.base} texto={texto} />;
}

export function CabeceraCosmos({ info, titulo, subtitulo, icono: Icono, alActualizar, extra, conUbicacion = false }: {
    info: InfoMarco; titulo: string; subtitulo?: string; icono: LucideIcon; alActualizar: () => void; extra?: AccionExtra[]; conUbicacion?: boolean;
}) {
    return (
        <div className="flex min-w-0 items-center gap-2">
            <Icono aria-hidden className="size-4 shrink-0" style={{ color: info.acento }} />
            <div className="min-w-0 flex-1">
                <RotuloClima>{titulo}</RotuloClima>
                {subtitulo && (info.base === "m" || info.base === "l" || info.base === "xl") && <span className="block truncate text-[11px] text-white/60" title={subtitulo}>{subtitulo}</span>}
            </div>
            {info.base !== "micro" && (
                <MenuClima info={info} conUnidades={false} conUbicacion={conUbicacion} ruta={RUTA_COSMOS} rutaEtiqueta="Abrir el clima espacial" alActualizar={alActualizar} extra={extra} />
            )}
        </div>
    );
}
