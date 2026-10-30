"use client";

// Vista del átomo «video-html» (HyperFrames) dentro del bloque protomolécula
// del lienzo universal (publicaciones, mensajes, páginas, grupos). SOLO LECTURA:
// reproduce, nunca edita la molécula del bloque. La decisión de qué mostrar la
// toma la función pura `elegirVista` (bloque-protomolecula.ts) y las URLs las
// inyecta el padre: el bloque es una instantánea y no habla con el servicio
// por su cuenta. Contrato: architecture/video-hyperframes.md §4.5.
import { elegirVista } from "@/lib/protomolecula/bloque-protomolecula";
import type { AtomoEnUso } from "@/lib/protomolecula/tipos";

export interface VistaVideoHtmlProps {
    atomo: AtomoEnUso;
    /** ¿Hay servicio local de HyperFrames vivo (127.0.0.1, puerto del servicio)? */
    servicioVivo: boolean;
    /** ¿Ya hay un vídeo renderizado por la malla? */
    renderHecho: boolean;
    /** URL del vídeo renderizado (del resultado de la cola de render). */
    urlVideo?: string;
    /** URL del póster estático (fotograma de referencia). */
    urlPoster?: string;
    /** URL base del servicio local, si está vivo; solo se usa con `servicioVivo`. */
    urlServicio?: string;
}

export function VistaVideoHtml({ atomo, servicioVivo, renderHecho, urlVideo, urlPoster, urlServicio }: VistaVideoHtmlProps) {
    const decision = elegirVista(atomo, servicioVivo, renderHecho);
    if (!decision) return null;

    if (decision.tipo === "suspendido") {
        return (
            <div data-testid="vista-video-html" role="status" className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                {decision.motivo}
            </div>
        );
    }

    if (decision.tipo === "vivo") {
        if (!urlServicio) {
            return (
                <div data-testid="vista-video-html" role="status" className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs text-muted-foreground">
                    {decision.motivo} Pero el bloque no recibió la vista previa en vivo; se muestra el póster o el vídeo.
                    <VistaPoster urlPoster={urlPoster} />
                </div>
            );
        }
        return (
            <iframe
                data-testid="vista-video-html"
                src={urlServicio}
                title={atomo.titulo ?? "Vista previa de HyperFrames"}
                sandbox="allow-scripts"
                className="aspect-video w-full cursor-pointer rounded-lg border border-border/40"
            />
        );
    }

    if (decision.tipo === "renderizado" && urlVideo) {
        return (
            <video
                data-testid="vista-video-html"
                src={urlVideo}
                poster={urlPoster}
                controls
                playsInline
                className="w-full rounded-lg border border-border/40"
            />
        );
    }

    return <VistaPoster urlPoster={urlPoster} />;
}

function VistaPoster({ urlPoster }: { urlPoster?: string }) {
    if (urlPoster) {
        return (
            <img
                data-testid="vista-video-html-póster"
                src={urlPoster}
                alt="Póster del vídeo"
                className="w-full rounded-lg border border-border/40"
            />
        );
    }
    return (
        <div data-testid="vista-video-html" className="rounded-lg border border-border/40 bg-muted/30 p-4 text-center text-xs text-muted-foreground">
            El vídeo se renderiza en la malla: aquí se verá cuando esté listo.
        </div>
    );
}
