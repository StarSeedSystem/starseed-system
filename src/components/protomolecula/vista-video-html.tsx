"use client";

/**
 * Protomolécula · Vista del átomo «Vídeo con HyperFrames» (`video-html`, HFR1018L).
 * Enseña por este orden el vídeo renderizado, la vista previa del servicio local o el
 * póster. La decisión es pura (`elegirVista`); nada de GSAP y telemetría apagada (§2).
 */
import type { VistaProps } from "@/lib/protomolecula/registro-atomos";

/** Base del servicio HyperFrames de esta neurona (contrato §3: 127.0.0.1:4490). */
export const BASE_SERVICIO_VIDEO = "http://127.0.0.1:4490";

export type TipoVistaVideo = "render" | "directo" | "poster" | "vacio";

export interface VistaVideoElegida {
  tipo: TipoVistaVideo;
  /** URL que se pinta; `null` solo cuando no hay nada que enseñar. */
  url: string | null;
  /** Motivo legible cuando `tipo` es «vacio». */
  motivo?: string;
}

/** Lo mínimo que necesita la decisión: valores de la molécula y enlaces ya guardados. */
export interface AtomoVideoHtml {
  id?: string;
  valores?: Record<string, unknown>;
  poster?: string | null;
  render?: string | null;
}

export const MOTIVO_VACIO = "Esta composición aún no tiene póster ni vídeo renderizado.";

/** Solo URLs seguras: http(s), blob, data de imagen/vídeo o ruta del propio OS. Rechaza `javascript:`. */
export function urlSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpia = valor.trim();
  if (!limpia || limpia.startsWith("//")) return null;
  if (limpia.startsWith("/") || /^(https?:\/\/|blob:)/i.test(limpia)) return limpia;
  return /^data:(image|video)\//i.test(limpia) ? limpia : null;
}

function primerUrl(...valores: unknown[]): string | null {
  for (const valor of valores) { const url = urlSegura(valor); if (url) return url; }
  return null;
}

function urlVistaPrevia(id: string | undefined): string | null {
  const limpio = id?.trim();
  return limpio ? `${BASE_SERVICIO_VIDEO}/vista/${encodeURIComponent(limpio)}` : null;
}

/**
 * Decide qué enseña el átomo: el render terminado gana; si no hay, la vista previa
 * del servicio local; si tampoco, el póster. Es pura: no toca red, disco ni reloj.
 */
export function elegirVista(
  atomo: AtomoVideoHtml | null | undefined,
  servicioVivo: boolean | string | null | undefined,
  renderHecho: boolean | string | null | undefined,
): VistaVideoElegida {
  const render = primerUrl(renderHecho, atomo?.render, atomo?.valores?.render, atomo?.valores?.video, atomo?.valores?.urlRender);
  if (render) return { tipo: "render", url: render };
  const vivo = primerUrl(servicioVivo) ?? (servicioVivo === true ? urlVistaPrevia(atomo?.id) : null);
  if (vivo) return { tipo: "directo", url: vivo };
  const poster = primerUrl(atomo?.poster, atomo?.valores?.poster, atomo?.valores?.portada);
  if (poster) return { tipo: "poster", url: poster };
  return { tipo: "vacio", url: null, motivo: MOTIVO_VACIO };
}

export interface PropsVistaVideoHtml extends VistaProps {
  /** `true` o la URL de la vista previa del servicio local; por defecto, apagado. */
  servicioVivo?: boolean | string | null;
  /** `true` o la URL del vídeo renderizado. */
  renderHecho?: boolean | string | null;
  /** Póster ya guardado; si falta se lee de los valores de la molécula. */
  poster?: string | null;
}

const MARCO = "overflow-hidden rounded-lg border border-border/50 bg-black";

export default function VistaVideoHtml({ atomoId, valores, servicioVivo = null, renderHecho = null, poster = null }: PropsVistaVideoHtml) {
  const elegida = elegirVista({ id: atomoId, valores, poster, render: null }, servicioVivo, renderHecho);
  if (elegida.tipo === "vacio" || !elegida.url) {
    return <p role="status" className="rounded-lg border border-border/50 bg-muted/20 p-3 text-sm text-muted-foreground">{elegida.motivo ?? MOTIVO_VACIO}</p>;
  }
  if (elegida.tipo === "directo") {
    return (
      <div data-testid="vista-video-html" data-modo="directo" className={MARCO}>
        <iframe title="Vista previa en vivo de la composición" src={elegida.url} className="aspect-video w-full" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" loading="lazy" />
      </div>
    );
  }
  if (elegida.tipo === "poster") {
    return (
      <figure data-testid="vista-video-html" data-modo="poster" className={`m-0 ${MARCO}`}>
        <img src={elegida.url} alt="Póster de la composición de vídeo" className="aspect-video w-full object-contain" loading="lazy" />
      </figure>
    );
  }
  return (
    <div data-testid="vista-video-html" data-modo="render" className={MARCO}>
      <video controls playsInline preload="metadata" poster={urlSegura(poster) ?? undefined} className="aspect-video w-full" aria-label="Vídeo renderizado de la composición">
        <source src={elegida.url} />
        Tu navegador no puede reproducir este vídeo.
      </video>
      <a href={elegida.url} target="_blank" rel="noopener noreferrer" className="block cursor-pointer px-3 py-2 text-xs text-primary underline">Abrir el vídeo renderizado</a>
    </div>
  );
}
