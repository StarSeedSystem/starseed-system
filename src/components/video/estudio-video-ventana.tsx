"use client";
/**
 * Estudio de vídeo (Ola 1018H · tarea K). Capas/clips y línea de tiempo de los data-* de la
 * composición, panel que emite órdenes `SdkOrder` (nunca GSAP, §2) y vista previa con
 * `<hyperframes-player>` del servicio local (127.0.0.1:4490, §4.3). Sin servicio: mensaje
 * claro y «Abrir en otra neurona». Datos y callbacks INYECTADOS.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard } from "lucide-react";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { SERVICIOS_CONOCIDOS, sondearServicio } from "@/lib/protomolecula/servicio-local";
/** Una capa de la composición, tal como vive en sus atributos data-*. */
export interface Clip { id: string; texto: string; start: number; duracion: number; pista: number; }
/** Capas/clip de una composición a partir de `data-start/data-duration/data-track-index`. */
export function parsearClips(html: string): Clip[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll(".clip")].map((el) => ({
    id: el.id || "clip", texto: (el.textContent ?? "").trim(),
    start: Number(el.getAttribute("data-start") ?? 0) || 0, duracion: Number(el.getAttribute("data-duration") ?? 0) || 0, pista: Number(el.getAttribute("data-track-index") ?? 0) || 0,
  }));
}
/** Aviso si la composición trae GSAP: su licencia Standard prohíbe editarla en un editor visual. */
export function avisoGsap(html: string): string {
  const deteccion = detectarAdaptadores(html);
  return deteccion.editableVisualmente ? "" : deteccion.motivo;
}
export interface EstudioVideoVentanaProps {
  html?: string; urlVista?: string; servicio?: "vivo" | "apagado"; // servicio: si falta, se sondea la neurona
  alOrdenar?: (orden: SdkOrder) => void; // orden del SDK que la Protomolécula/servicio aplica como parche
  abrirOtraNeurona?: () => void; // vista sin servicio: abre el estudio en otra neurona
}
type EstadoServicio = "comprobando" | "vivo" | "apagado";
const SERVICIO_VIDEO = SERVICIOS_CONOCIDOS.find((s) => s.id === "hyperframes") ?? { id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/health" };
const ESTADO_TEXTO = { comprobando: "Comprobando la neurona de vídeo…", vivo: "Servicio de vídeo vivo", apagado: "Servicio de vídeo apagado" } as const;
const BOTON = "cursor-pointer rounded-full border border-primary/40 bg-primary/15 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/25";
const TARJETA = "rounded-2xl border border-border/50 bg-card/40 p-3 text-muted-foreground backdrop-blur-xl";
const FILA = "flex w-full cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition-colors";
const CAMPO = "rounded-full border border-border/50 bg-background/40 px-2 py-1 text-xs outline-none";
export function EstudioVideoVentana({ html, urlVista, servicio, alOrdenar, abrirOtraNeurona }: EstudioVideoVentanaProps) {
  const clips = useMemo(() => parsearClips(html ?? ""), [html]);
  const aviso = useMemo(() => avisoGsap(html ?? ""), [html]);
  const [estado, setEstado] = useState<EstadoServicio>(servicio ?? "comprobando");
  const contenedor = useRef<HTMLDivElement>(null);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const clip = seleccion !== null ? clips[seleccion] : undefined;
  const [texto, setTexto] = useState("");
  const [empieza, setEmpieza] = useState("");
  const [dura, setDura] = useState("");
  useEffect(() => {
    if (servicio !== undefined) return;
    let viviente = true;
    sondearServicio(SERVICIO_VIDEO, fetch).then((s) => { if (viviente) setEstado(s.vivo ? "vivo" : "apagado"); }).catch(() => { if (viviente) setEstado("apagado"); });
    return () => { viviente = false; };
  }, [servicio]);
  useEffect(() => {
    const ref = contenedor.current;
    if (!ref || estado !== "vivo" || !urlVista) return;
    const reproductor = document.createElement("hyperframes-player");
    reproductor.setAttribute("src", urlVista); reproductor.setAttribute("aria-label", "Vista previa de la composición");
    ref.replaceChildren(reproductor);
    return () => ref.replaceChildren();
  }, [estado, urlVista]);
  const elegir = (i: number) => { setSeleccion(i); setTexto(clips[i]?.texto ?? ""); setEmpieza(String(clips[i]?.start ?? 0)); setDura(String(clips[i]?.duracion ?? 0)); };
  const objetivo = clip ? `#${clip.id}` : "";
  const ordenTexto = () => alOrdenar?.({ type: "setText", target: objetivo, value: texto });
  const ordenTiempos = () => alOrdenar?.({ type: "setTiming", target: objetivo, start: Number(empieza) || 0, duration: Number(dura) || 0 });
  const campo = (literal: string, aria: string, valor: string, cambiar: (v: string) => void, ancho: string) => (
    <label className="flex items-center gap-1 text-xs">{literal}
      <input aria-label={aria} value={valor} onChange={(e) => cambiar(e.target.value)} className={`${CAMPO} ${ancho}`} />
    </label>
  );
  return (
    <div className="flex h-full flex-col text-foreground">
      <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-4 py-3">
        <Clapperboard className="size-4 text-muted-foreground" aria-hidden /><h3 className="text-sm font-semibold">Estudio de vídeo</h3>
        <span className="ml-auto rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground">{ESTADO_TEXTO[estado]}</span>
      </header>
      {aviso && <p role="alert" className={`${TARJETA} mx-4 mt-3 text-xs text-foreground`}>{aviso}</p>}
      {estado === "apagado" ? (
        <div role="alert" className={`${TARJETA} m-4 text-sm`}>
          No hay servicio de vídeo HyperFrames en esta neurona, así que la vista previa no puede vivir aquí.
          <button type="button" onClick={abrirOtraNeurona} disabled={!abrirOtraNeurona}
            className={`${BOTON} mt-2 flex w-full justify-center py-1.5 disabled:cursor-not-allowed disabled:opacity-50`}>Abrir en otra neurona</button>
        </div>
      ) : (
        <div ref={contenedor} data-prueba="hyperframes-player" aria-label="Vista previa de la composición"
          className="mx-4 mt-3 min-h-36 flex-1 overflow-hidden rounded-2xl border border-border/50 bg-black/40 backdrop-blur-xl">
          {estado === "comprobando" && <p className="p-4 text-xs text-muted-foreground">Buscando la neurona de vídeo…</p>}
          {estado === "vivo" && !urlVista && <p className="p-4 text-xs text-muted-foreground">Aún no hay composición: compón un átomo «video-html» en la Protomolécula.</p>}
        </div>
      )}
      <section aria-label="Capas y línea de tiempo" className={`${TARJETA} mx-4 my-3 flex-1 overflow-auto`}>
        {clips.length === 0 ? (
          <p role="status" className="p-3 text-xs">Aún no hay capas en la composición.</p>
        ) : (
          <ul className="space-y-1">
            {clips.map((c, i) => (
              <li key={`${c.id}-${i}`}>
                <button type="button" aria-pressed={seleccion === i} onClick={() => elegir(i)}
                  className={`${FILA} ${seleccion === i ? "border-primary/50 bg-primary/15 text-foreground" : "border-border/40 bg-background/30 text-muted-foreground hover:text-foreground"}`}>
                  <span className="font-mono text-[10px]">pista {c.pista}</span><span className="truncate">{c.id}</span>
                  <span className="ml-auto font-mono text-[10px]">{c.start}s · {c.duracion}s</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Propiedades del clip" className={`${TARJETA} mx-4 mb-3 text-foreground`}>
        {!clip ? <p className="text-xs text-muted-foreground">Elige una capa para ver sus propiedades.</p> : (
          <div className="space-y-2">
            {campo("Texto", "Texto del clip", texto, setTexto, "w-full")}
            <button type="button" onClick={ordenTexto} className={BOTON}>Aplicar texto</button>
            <div className="flex flex-wrap items-end gap-2">
              {campo("Empieza", "Empieza (segundos)", empieza, setEmpieza, "w-16")} {campo("Dura", "Dura (segundos)", dura, setDura, "w-16")}
              <button type="button" onClick={ordenTiempos} className={BOTON}>Aplicar tiempos</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
