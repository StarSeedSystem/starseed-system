"use client";

/**
 * Protomolécula · VISTA DEL ÁTOMO «video-html» (HyperFrames) dentro del bloque
 * protomolécula. Contrato: architecture/video-hyperframes.md §4.1 y §5L.
 *
 * Qué se ve lo decide `elegirVista` del bloque: el vídeo ya renderizado
 * (`renderUrl` en los valores), la vista previa en vivo del servicio local de la
 * neurona (`vistaId` → 127.0.0.1:4490) o el póster (`posterUrl`). La salud del
 * servicio se sondea UNA sola vez al montar: nada de sondeos en bucle.
 */
import { useEffect, useMemo, useState } from "react";
import { ATOMO_VIDEO_HTML, elegirVista, urlVistaViva } from "@/lib/protomolecula/bloque-protomolecula";
import { SERVICIOS_CONOCIDOS, sondearServicio, type FetchLocal } from "@/lib/protomolecula/servicio-local";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";

type Sondeo = (f: FetchLocal) => Promise<{ vivo: boolean }>;

const defHyperframes = SERVICIOS_CONOCIDOS.find((d) => d.id === "hyperframes") ?? null;
const sondearBase: Sondeo = defHyperframes
    ? (f) => sondearServicio(defHyperframes, f)
    : async () => ({ vivo: false });
const fetchBase: FetchLocal = (url, init) => fetch(url, init);

const textoDe = (valores: Record<string, unknown>, clave: string): string | null => {
    const valor = valores[clave];
    return typeof valor === "string" && valor.length > 0 ? valor : null;
};

export interface VistaVideoHtmlProps extends VistaProps {
    /** Sondeo del servicio local; inyectable para evitar llamada real en pruebas. */
    sondear?: Sondeo;
}

export default function VistaVideoHtml({ valores, sondear = sondearBase }: VistaVideoHtmlProps) {
    const [vivo, setVivo] = useState(false);
    useEffect(() => {
        let montado = true;
        sondear(fetchBase)
            .then((r) => { if (montado) setVivo(Boolean(r.vivo)); })
            .catch(() => { if (montado) setVivo(false); });
        return () => { montado = false; };
    }, [sondear]);

    const renderUrl = textoDe(valores, "renderUrl");
    const posterUrl = textoDe(valores, "posterUrl");
    const decision = useMemo(
        () => elegirVista({ herramientaId: ATOMO_VIDEO_HTML, estado: "activo" }, vivo, renderUrl !== null),
        [vivo, renderUrl],
    );
    const enVivo = decision === "vivo" ? urlVistaViva(textoDe(valores, "vistaId") ?? "") : null;

    if (decision === "render" && renderUrl) {
        return (
            <video
                src={renderUrl}
                poster={posterUrl ?? undefined}
                controls
                preload="metadata"
                aria-label="Vídeo compuesto con HyperFrames"
                className="h-full min-h-64 w-full rounded-md border bg-background"
            />
        );
    }
    if (enVivo) {
        return (
            <iframe
                src={enVivo}
                title="Vista previa en vivo del vídeo"
                sandbox="allow-scripts"
                className="h-full min-h-64 w-full rounded-md border bg-background"
            />
        );
    }
    if (posterUrl) {
        return (
            <img
                src={posterUrl}
                alt="Póster del vídeo pendiente de render"
                className="h-full min-h-64 w-full rounded-md border bg-background object-cover"
            />
        );
    }
    return (
        <p role="status" className="p-3 text-sm text-muted-foreground">
            El vídeo compone con HyperFrames: renderízalo en el Estudio de vídeo para verlo aquí.
        </p>
    );
}
