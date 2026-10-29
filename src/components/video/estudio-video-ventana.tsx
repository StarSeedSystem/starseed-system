"use client";

/**
 * HFR1018K · Ventana «Estudio de vídeo» (HyperFrames, contrato §4.5). Capas/clips
 * y línea de tiempo leídas de los atributos data-* de la composición; panel que
 * emite órdenes de operaciones-sdk.ts; vista previa con <hyperframes-player>
 * servida por el servicio local. El editor visual NO usa GSAP (contrato §2): si
 * la composición lo trae, se avisa y sus animaciones no se editan.
 */

import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";

/** Reproductor del paquete @hyperframes/player, servido por el servicio local. */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "hyperframes-player": { src?: string; className?: string; style?: CSSProperties };
    }
  }
}

/** Clip de la composición, leído de sus atributos data-* (contrato HyperFrames). */
export interface ClipEstudio {
  id: string;
  etiqueta: string; // id del elemento, o etiqueta de reserva
  inicio: number;   // data-start, en segundos
  duracion: number; // data-duration, en segundos
  pista: number;    // data-track-index
  texto: string;    // textContent del clip
}

export interface PropsEstudioVideo {
  /** HTML de la composición (de la Protomolécula o del servicio local). */
  html?: string;
  /** URL de la composición servida por el servicio local de esta neurona. */
  urlVistaPrevia?: string;
  /** Emite cada orden del panel de propiedades (se traduce a parches del SDK). */
  onOrden?: (orden: SdkOrder) => void;
  /** «Abrir en otra neurona»: la malla elige donde haya recursos (contrato §4.4). */
  onAbrirEnOtraNeurona?: () => void;
}

/** Cambios del panel → órdenes para el SDK HyperFrames; solo lo distinto. */
export function ordenesDeCambio(clip: ClipEstudio, texto: string, inicio: number, duracion: number): SdkOrder[] {
  const ordenes: SdkOrder[] = [];
  if (texto !== clip.texto) ordenes.push({ type: "setText", target: clip.id, value: texto });
  if (inicio !== clip.inicio) ordenes.push({ type: "setAttribute", target: clip.id, name: "data-start", value: String(inicio) });
  if (duracion !== clip.duracion) ordenes.push({ type: "setAttribute", target: clip.id, name: "data-duration", value: String(duracion) });
  return ordenes;
}

/** Lee los clips (class="clip") del HTML: entrada → salida, sin efectos. */
export function parsearClips(html: string): ClipEstudio[] {
  const doc = new DOMParser().parseFromString(html || "", "text/html");
  return Array.from(doc.querySelectorAll("[class~=\"clip\"]")).map((el, i) => ({
    id: el.id || `clip-${i}`,
    etiqueta: el.id || `clip ${i + 1}`,
    inicio: Number(el.getAttribute("data-start") ?? 0) || 0,
    duracion: Number(el.getAttribute("data-duration") ?? 0) || 0,
    pista: Number(el.getAttribute("data-track-index") ?? 0) || 0,
    texto: el.textContent || "",
  }));
}

export function EstudioVideoVentana({ html, urlVistaPrevia, onOrden, onAbrirEnOtraNeurona }: PropsEstudioVideo) {
  const clips = useMemo(() => parsearClips(html ?? ""), [html]);
  const conGsap = useMemo(() => detectarAdaptadores(html ?? "").usados.includes("gsap"), [html]);
  const total = Math.max(0, ...clips.map((c) => c.inicio + c.duracion));
  const [activo, setActivo] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [inicio, setInicio] = useState(0);
  const [duracion, setDuracion] = useState(1);
  const clip = clips.find((c) => c.id === activo) ?? null;

  const elegir = (id: string) => {
    const c = clips.find((x) => x.id === id);
    if (!c) return;
    setActivo(id);
    setTexto(c.texto);
    setInicio(c.inicio);
    setDuracion(c.duracion);
  };

  const aplicar = () => {
    if (!clip) return;
    for (const orden of ordenesDeCambio(clip, texto, inicio, duracion)) onOrden?.(orden);
  };

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-white/10 bg-black/30 p-3" data-ss-elemento="ventana::estudio-video">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Estudio de vídeo · HyperFrames</h3>
        <span className="text-muted-foreground shrink-0 text-xs">{clips.length} clips · {total.toFixed(1)} s</span>
      </div>
      {conGsap && (
        <p role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200">
          La composición usa GSAP: se reproduce, pero sus animaciones no se editan aquí (licencia GSAP Standard). Se puede convertir a WAAPI.
        </p>
      )}
      {clips.length === 0 && (
        <p className="text-muted-foreground text-xs">
          Sin composición: pide unos segundos de vídeo a Astraura o crea una en la Protomolécula y se abrirá aquí.
        </p>
      )}
      {clips.map((c) => (
        <button key={c.id} type="button" onClick={() => elegir(c.id)}
          className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2 py-1 text-left text-xs ${clip?.id === c.id ? "border-cyan-400/60 bg-cyan-400/10" : "border-white/10 hover:border-white/25"}`}>
          <span className="truncate">{c.etiqueta}</span>
          <span className="text-muted-foreground shrink-0">{c.inicio}s +{c.duracion}s · pista {c.pista}</span>
        </button>
      ))}
      {clips.length > 0 && (
        <div className="relative h-6 overflow-hidden rounded-lg border border-white/10 bg-black/40" aria-label="Línea de tiempo">
          {clips.map((c) => (
            <span key={c.id} title={c.etiqueta} className="absolute rounded bg-cyan-400/40"
              style={{ left: `${total ? (c.inicio / total) * 100 : 0}%`, width: `${total && c.duracion ? (c.duracion / total) * 100 : 0}%`, top: `${c.pista * 8}px`, height: "6px" }} />
          ))}
        </div>
      )}
      <fieldset className="flex flex-wrap items-end gap-2 text-xs">
        <legend className="text-muted-foreground">Propiedades {clip ? `de «${clip.etiqueta}»` : ""}</legend>
        <label className="flex min-w-36 flex-1 flex-col gap-1">
          <span>Texto del clip</span>
          <input aria-label="Texto del clip" value={texto} onChange={(e) => setTexto(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span>Inicio (s)</span>
          <input aria-label="Inicio (s)" type="number" min={0} step={0.1} value={inicio} onChange={(e) => setInicio(Number(e.target.value) || 0)} className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          <span>Duración (s)</span>
          <input aria-label="Duración (s)" type="number" min={0} step={0.1} value={duracion} onChange={(e) => setDuracion(Number(e.target.value) || 0)} className="w-20 rounded-lg border border-white/10 bg-black/40 px-2 py-1" />
        </label>
        <button type="button" onClick={aplicar} disabled={!clip} className="cursor-pointer rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40">Aplicar cambios</button>
      </fieldset>
      <div className="min-h-24 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/60">
        {urlVistaPrevia ? (
          <hyperframes-player src={urlVistaPrevia} style={{ width: "100%", height: "100%" }} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-muted-foreground text-xs">Sin vista previa: el servicio local de HyperFrames no está despierto en esta neurona.</p>
            <button type="button" onClick={onAbrirEnOtraNeurona} className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-xs hover:bg-white/10">Abrir en otra neurona</button>
          </div>
        )}
      </div>
    </div>
  );
}
