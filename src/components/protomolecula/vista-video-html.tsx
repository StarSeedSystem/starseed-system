"use client";

/**
 * Protomolécula · Vista del átomo «Vídeo con HyperFrames» (HFR1018O).
 *
 * Muestra el póster, el vídeo ya renderizado o, si hay un servicio local activo,
 * la vista previa en vivo. Solo renderiza en cliente; el render en servidor se controla
 * a través del servicio HyperFrames (`planRender`).
 */
import { useMemo, useState, type CSSProperties } from "react";
import { VIDEO_HTML, ValoresVideoHtml, planRender } from "@/lib/protomolecula/atomos/video-html";
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";
import { elegirVista } from "@/lib/protomolecula/bloque-protomolecula";
import { elegirVista as elegirVistaCore } from "@/lib/protomolecula/bloque-protomolecula";

/** Función pura para decidir qué mostrar (componente separado de la vista). */
export function elegirVista(
  atomoId: string,
  servicioVivo: boolean | null,
  renderHecho: boolean,
  valores: Record<string, unknown>
): "poster" | "video" | "preview" | "loading" {
  if (!servicioVivo && !renderHecho) return "loading";
  const duracion = Number(valores.duracion ?? VIDEO_HTML.parametros.find(p => p.id === "duracion")?.defecto);
  const urlPoster = valores.urlPoster ? String(valores.urlPoster) : null;
  if (!urlPoster) return "loading";
  if (servicioVivo) return "preview";
  return "video";
}

/** Muestra el póster del vídeo, ya sea una imagen o un fotograma. */
function VistaPoster({ url, clase }: { url: string; clase?: string }) {
  const [carga, setCarga] = useState(true);
  const [error, setError] = useState(false);
  return (
    <div className={clase ?? "relative h-64 w-full overflow-hidden rounded-md border bg-black"}>
      {carga && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Cargando póster…</div>
        </div>
      )}
      {error ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-destructive text-sm">Error al cargar póster</div>
        </div>
      ) : (
        <img
          src={url}
          alt="Póster del vídeo"
          className="h-full w-full object-cover"
          onLoad={() => setCarga(false)}
          onError={() => {
            setCarga(false);
            setError(true);
          }}
        />
      )}
    </div>
  );
}

/** El reproductor de vídeo, reutiliza `<video>` de HTML5. */
function ReproductorVideo({ src, clase }: { src: string; clase?: string }) {
  const [carga, setCarga] = useState(true);
  const [error, setError] = useState(false);
  return (
    <div className={clase ?? "relative h-64 w-full overflow-hidden rounded-md border bg-black"}>
      {carga && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Cargando vídeo…</div>
        </div>
      )}
      {error ? (
        <div className="flex h-full items-center justify-center">
          <div className="text-destructive text-sm">Error al cargar vídeo</div>
        </div>
      ) : (
        <video
          src={src}
          controls
          playsInline
          className="h-full w-full object-cover"
          onLoadedData={() => setCarga(false)}
          onError={() => {
            setCarga(false);
            setError(true);
          }}
        />
      )}
    </div>
  );
}

/** Vista previa en vivo del servicio HyperFrames local. */
function VistaPrevia({ atomoId, clase }: { atomoId: string; clase?: string }) {
  const previewUrl = useMemo(() => {
    const host = process.env.NEXT_PUBLIC_HYPFRAMES_HOST || "http://localhost:4490";
    return `${host}/preview/${atomoId}`;
  }, [atomoId]);
  return <VistaPoster url={previewUrl} clase={clase} />;
}

export default function VistaVideoHtml({ atomoId, valores }: VistaProps) {
  const limpios = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valores)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
    }
    return out;
  }, [valores]);

  const servicioVivo = useMemo(() => {
    // Simple check: HyperFrames service is available in local environment
    // The actual service check is done in bloque-protomolecula.ts
    // For the component, we check for a global hyperframes service
    return typeof window !== "undefined" && (window as any).hyperframesService !== undefined;
  }, []);
  const renderHecho = useMemo(() => Boolean(valores.videoUrl), [valores]);
  const urlPoster = valores.urlPoster ? String(valores.urlPoster) : null;

  const modoVista = useMemo(() => elegirVistaCore(atomoId, servicioVivo, renderHecho, limpios), [atomoId, servicioVivo, renderHecho, limpios]);

  const comandoRender = useMemo(() => {
    const valoresVideo = limpios as ValoresVideoHtml;
    return planRender(valoresVideo);
  }, [limpios]);

  const [avisos, setAviso] = useState<string[]>([]);

  const iniciarRender = () => {
    if (typeof window === "undefined") return;
    const evento = new CustomEvent("hyperframes:iniciar-render", {
      detail: { atomoId, comando: comandoRender },
      cancelable: true,
    });
    const atendido = window.dispatchEvent(evento);
    if (atendido) {
      setAviso((a) => [...a, "Render solicitado; el servicio HyperFrames intentará mostrar el progreso."]);
    } else {
      setAviso((a) => [...a, "No pude iniciar el render: la estación de servicios no respondió."]);
    }
  };

  const limpiarAvisos = () => setAviso([]);

  return (
    <div className="flex w-full flex-col gap-3">
      {modoVista === "loading" && (
        <div className="flex w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/30 p-6">
          <div className="text-sm text-muted-foreground">Video no disponible aún</div>
          {urlPoster && <VistaPoster url={urlPoster} clase="h-32 w-64" />}
          <button
            type="button"
            onClick={iniciarRender}
            className="cursor-pointer rounded bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600"
          >
            Iniciar Render
          </button>
          {avisos.map((a, i) => (
            <div key={i} className="text-xs text-muted-foreground">{a}</div>
          ))}
        </div>
      )}

      {modoVista === "video" && urlPoster && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Vídeo ya renderizado</div>
          <ReproductorVideo src={urlPoster} clase="h-80 w-full" />
        </div>
      )}

      {modoVista === "preview" && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Vista previa en vivo (servicio HyperFrames local activo)</div>
          <VistaPrevia atomoId={atomoId} clase="h-80 w-full" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Vídeo con HyperFrames</span>
        <span>· herramientaId: {VIDEO_HTML.herramientaId}</span>
        <span>· duración: {limpios.duracion ?? VIDEO_HTML.parametros.find(p => p.id === "duracion")?.defecto}s</span>
        <span>· resolución: {limpios.resolucion ?? VIDEO_HTML.parametros.find(p => p.id === "resolucion")?.defecto}</span>
        <span>· {servicioVivo ? "servicio vivo" : "servicio apagado"} · render {renderHecho ? "hecho" : "pendiente"}</span>
      </div>
    </div>
  );
}
