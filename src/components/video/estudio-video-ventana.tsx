"use client";
/**
 * HFR1018K · Ventana «Estudio de vídeo» (dashboard, escritorio, pizarra y flotante). Contrato:
 * architecture/video-hyperframes.md: capas y línea de tiempo de los data-* de la composición,
 * panel que emite órdenes SdkOrder, vista previa con <hyperframes-player> del servicio local
 * (sin servicio: mensaje + «Abrir en otra neurona»), aviso si trae GSAP. Todo inyectable.
 */
import * as React from "react";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
export const ORIGEN_SERVICIO_DEFECTO = "http://localhost:4490"; // servicio local de la neurona (contrato §3)
/** Una capa/clip de la composición, según sus atributos data-*. */
export interface Capa { id: string; texto: string; inicio: number; duracion: number; pista: number; }
export interface PropiedadesEstudioVideo {
  /** HTML de la composición; `idVista` = `/vista/:id` del servicio (contrato §3); compacto para widgets. */
  htmlComposicion?: string; idVista?: string; origenServicio?: string; compacto?: boolean;
  /** ¿Está vivo el servicio? Inyectable (por defecto, su /health). Emisores: órdenes y «Otra neurona». */
  hayServicio?: () => boolean | Promise<boolean>;
  alOrdenar?: (ordenes: SdkOrder[]) => void;
  alAbrirEnOtraNeurona?: () => void;
}
export function capasDeComposicion(html: string): Capa[] {
  if (!html || typeof document === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.querySelectorAll(".clip")).map((el, i) => ({ id: el.id || `clip-${i}`, texto: (el.textContent ?? "").trim(),
    inicio: Number(el.getAttribute("data-start")) || 0, duracion: Number(el.getAttribute("data-duration")) || 0, pista: Number(el.getAttribute("data-track-index")) || 0 }));
}
/** Segundos que abarca la composición: el final de la capa más larga. */
export function duracionTotal(capas: Capa[]): number {
  return capas.reduce((total, c) => Math.max(total, c.inicio + c.duracion), 0);
}
/** Id de composición (`data-composition-id`) que el servicio sirve en `/vista/:id`. */
export function idDeComposicion(html: string): string | null {
  if (!html || typeof document === "undefined") return null;
  return new DOMParser().parseFromString(html, "text/html").querySelector("[data-composition-id]")?.getAttribute("data-composition-id") || null;
}
/** Órdenes SdkOrder mínimas para pasar la capa al texto y los tiempos pedidos. */
export function ordenesDeEdicion(capa: Capa, texto: string, inicio: number, duracion: number): SdkOrder[] {
  const ordenes: SdkOrder[] = [];
  if (texto !== capa.texto) ordenes.push({ type: "setText", target: capa.id, value: texto });
  if (inicio !== capa.inicio || duracion !== capa.duracion) ordenes.push({ type: "setTiming", target: capa.id, start: inicio, duration: duracion });
  return ordenes;
}
/** Comprobación por defecto: salud del servicio local. Solo se usa si quien monta no trae la suya. */
const saludPorDefecto = async (origen: string): Promise<boolean> => {
  try { return (await fetch(`${origen}/health`, { cache: "no-store" })).ok; } catch { return false; }
};
const BOTON = "cursor-pointer rounded-full border border-[#00F0FF]/40 bg-[#00F0FF]/10 px-3 py-2 text-[11px] text-[#00F0FF] transition-all duration-200 hover:bg-[#00F0FF]/20";
const CAMPO = "w-full cursor-pointer rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-[11px] text-white/90 outline-none focus:border-[#00F0FF]/50";
export function EstudioVideoVentana(props: PropiedadesEstudioVideo): React.ReactElement {
  const { htmlComposicion = "", idVista, origenServicio = ORIGEN_SERVICIO_DEFECTO, hayServicio, alOrdenar, alAbrirEnOtraNeurona, compacto } = props;
  const [estado, setEstado] = React.useState<"comprobando" | "listo" | "sin-servicio">("comprobando");
  const [seleccion, setSeleccion] = React.useState(0);
  const [cambio, setCambio] = React.useState({ texto: "", inicio: 0, duracion: 0 });
  const capas = React.useMemo(() => capasDeComposicion(htmlComposicion), [htmlComposicion]);
  const total = duracionTotal(capas);
  const deteccion = detectarAdaptadores(htmlComposicion);
  React.useEffect(() => {
    let vivo = true;
    const consulta = hayServicio ? Promise.resolve(hayServicio()) : saludPorDefecto(origenServicio);
    consulta.then((ok) => { if (vivo) setEstado(ok ? "listo" : "sin-servicio"); }).catch(() => { if (vivo) setEstado("sin-servicio"); });
    return () => { vivo = false; };
  }, [hayServicio, origenServicio]);
  const elegir = (i: number) => {
    setSeleccion(i);
    const elegida = capas[i];
    if (elegida) setCambio({ texto: elegida.texto, inicio: elegida.inicio, duracion: elegida.duracion });
  };
  const fraccion = (v: number): number => Math.min(100, Math.max(0, (v / Math.max(total, 0.001)) * 100));
  const aplicar = () => {
    const ordenes = capas[seleccion] ? ordenesDeEdicion(capas[seleccion], cambio.texto, cambio.inicio, cambio.duracion) : [];
    if (ordenes.length > 0) alOrdenar?.(ordenes);
  };
  return (
    <div data-testid="estudio-video" className="flex h-full min-h-0 flex-col gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-2 text-[11px] text-white/80">
      <p className="font-semibold text-white/90">Estudio de vídeo · {total.toFixed(1)} s</p>
      {deteccion.usados.includes("gsap")
        ? <p data-testid="aviso-gsap" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-amber-200">{deteccion.motivo}</p>
        : null}
      <div data-testid="linea-tiempo" aria-label="Línea de tiempo simple" className="relative h-2 rounded-full bg-white/10">
        {capas.map((c, i) => (
          <button key={`${c.id}-${i}`} type="button" tabIndex={0} aria-label={`Capa ${c.id} · ${c.inicio} s, ${c.duracion} s`} onClick={() => elegir(i)}
            style={{ left: `${fraccion(c.inicio)}%`, width: `${Math.max(2, fraccion(c.duracion))}%` }} className={`absolute top-0 h-2 cursor-pointer rounded-full transition-all duration-200 ${i === seleccion ? "bg-[#00F0FF]" : "bg-white/30"}`} />
        ))}
      </div>
      {estado === "sin-servicio" ? (
        <div data-testid="sin-servicio" className="flex flex-1 flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="max-w-[240px] leading-relaxed text-white/60">El servicio HyperFrames no está en esta neurona: la vista previa necesita su reproductor.</p>
          <button type="button" tabIndex={0} onClick={alAbrirEnOtraNeurona} className={BOTON}>Abrir en otra neurona</button>
        </div>
      ) : estado === "comprobando" ? (
        <p data-testid="comprobando-servicio" className="animate-pulse p-2 text-white/40">Comprobando el servicio de vídeo…</p>
      ) : (
        <div className="grid min-h-0 flex-1 gap-2">
          <ul data-testid="lista-capas" className="min-h-0 overflow-y-auto">
            {capas.map((c, i) => (
              <li key={`${c.id}-${i}`}>
                <button type="button" tabIndex={0} onClick={() => elegir(i)}
                  className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-all duration-200 ${i === seleccion ? "bg-[#00F0FF]/15" : "hover:bg-white/5"}`}>
                  <span className="truncate">{c.id}</span>
                  <span className="text-white/40">{c.inicio} s · {c.duracion} s · pista {c.pista}</span>
                </button>
              </li>
            ))}
            {capas.length === 0 ? <li className="p-2 text-white/40">Sin capas en la composición.</li> : null}
          </ul>
          <div data-testid="panel-propiedades" className="flex flex-wrap gap-1">
            <label>Texto<input type="text" value={cambio.texto} onChange={(e) => setCambio({ ...cambio, texto: e.target.value })} className={CAMPO} /></label>
            <label>Inicio (s)<input type="number" min={0} step={0.1} value={cambio.inicio} onChange={(e) => setCambio({ ...cambio, inicio: Number(e.target.value) || 0 })} className={CAMPO} /></label>
            <label>Duración (s)<input type="number" min={0} step={0.1} value={cambio.duracion} onChange={(e) => setCambio({ ...cambio, duracion: Number(e.target.value) || 0 })} className={CAMPO} /></label>
            <button type="button" tabIndex={0} onClick={aplicar} className={BOTON}>Aplicar cambios</button>
          </div>
          <div data-testid="vista-previa" aria-label="Vista previa" className="overflow-hidden rounded-xl border border-white/10 bg-black/40" style={{ minHeight: compacto ? 100 : 180 }}>
            {React.createElement("hyperframes-player", { src: `${origenServicio}/vista/${idVista ?? idDeComposicion(htmlComposicion) ?? "main"}`, class: "h-full w-full", style: { width: "100%", height: "100%" } })}
          </div>
        </div>
      )}
    </div>
  );
}