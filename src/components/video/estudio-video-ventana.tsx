'use client';
/** Estudio de vídeo · widget «estudio-video» (HFR1018K · Ola 1018H) · contrato: architecture/video-hyperframes.md §4-5.
 *  Capas y línea de tiempo desde los atributos data-*; el panel emite órdenes SdkOrder (operaciones-sdk.ts); vista previa con
 *  <hyperframes-player> servida por la neurona (127.0.0.1:4490). Jamás GSAP en el editor: la composición que la trae se avisa. */
import * as React from "react";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { SERVICIOS_CONOCIDOS, llamarServicio, sondearServicio, type FetchLocal } from "@/lib/protomolecula/servicio-local";
declare module "react" { namespace JSX { interface IntrinsicElements {
  "hyperframes-player": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { src?: string };
} } }
const DEF = SERVICIOS_CONOCIDOS.find((s) => s.id === "hyperframes") ?? { id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/health" };
const fetchLocal: FetchLocal = (url, init) => fetch(url, init);
export interface Capa { id: string; pista: number; inicio: number; duracion: number; texto: string }
/** Capas/clips de la composición, leídas de sus atributos data-* (formato de plantilla.ts). */
export function capasDeComposicion(html: string): Capa[] {
  const capas: Capa[] = [], patron = /<[^>]*class="[^"]*\bclip\b[^"]*"[^>]*>/gi;
  for (let m: RegExpExecArray | null = patron.exec(html); m; m = patron.exec(html)) {
    const e = m[0], attr = (n: string) => e.match(new RegExp(`\\s${n}="([^"]*)"`))?.[1] ?? "", id = attr("id");
    if (!id) continue;
    capas.push({ id, texto: (html.slice(m.index + e.length).match(/^[^<]*/) ?? [""])[0].trim(),
      pista: Number(attr("data-track-index")) || 0, inicio: Number(attr("data-start")) || 0, duracion: Number(attr("data-duration")) || 0 });
  }
  return capas;
}
export interface PropsEstudioVideo {
  widget?: DashboardWidget;
  onUpdateSettings?: (parche: Record<string, unknown>) => void;
  /** Órdenes fuera de esta neurona (Protomolécula, salas). Sin él: POST /editar al servicio local. */
  onOrdenes?: (ordenes: SdkOrder[]) => void;
  pedir?: FetchLocal;
  onAbrirOtraNeurona?: () => void;
}
type EstadoServicio = "comprobando" | "vivo" | "caido";
export function EstudioVideoVentana({ widget, onUpdateSettings, onOrdenes, pedir, onAbrirOtraNeurona }: PropsEstudioVideo) {
  const ajustes = (widget?.settings ?? {}) as Record<string, unknown>;
  const composicion = typeof ajustes.composicion === "string" ? ajustes.composicion : "";
  const idComposicion = typeof ajustes.idComposicion === "string" ? ajustes.idComposicion : "";
  const capas = React.useMemo(() => capasDeComposicion(composicion), [composicion]);
  const gsap = React.useMemo(() => (composicion ? detectarAdaptadores(composicion) : null), [composicion]);
  const [servicio, setServicio] = React.useState<EstadoServicio>("comprobando");
  const [seleccion, setSeleccion] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState({ texto: "", inicio: "", duracion: "" });
  React.useEffect(() => {
    let vivo = true;
    sondearServicio(DEF, pedir ?? fetchLocal).then((r) => { if (vivo) setServicio(r.vivo ? "vivo" : "caido"); })
      .catch(() => { if (vivo) setServicio("caido"); });
    return () => { vivo = false; };
  }, [pedir]);
  const capa = capas.find((c) => c.id === seleccion) ?? null;
  function abrir(c: Capa) { setSeleccion(c.id); setPanel({ texto: c.texto, inicio: String(c.inicio), duracion: String(c.duracion) }); }
  function aplicar() {
    if (!capa) return;
    const ordenes: SdkOrder[] = [];
    if (panel.texto !== capa.texto) ordenes.push({ type: "setText", target: capa.id, value: panel.texto });
    const cambiaI = panel.inicio !== "" && panel.inicio !== String(capa.inicio), cambiaD = panel.duracion !== "" && panel.duracion !== String(capa.duracion);
    if (cambiaI || cambiaD) {
      const inicio = cambiaI ? Number(panel.inicio) : capa.inicio, duracion = cambiaD ? Number(panel.duracion) : capa.duracion;
      if (Number.isFinite(inicio) && inicio >= 0 && Number.isFinite(duracion) && duracion >= 0) ordenes.push({ type: "setTiming", target: capa.id, start: inicio, duration: duracion });
    }
    if (ordenes.length) { if (onOrdenes) onOrdenes(ordenes); else void enviar(ordenes); }
  }
  async function enviar(ordenes: SdkOrder[]) {
    const r = await llamarServicio(DEF, "/editar", { composicion, ordenes }, pedir ?? fetchLocal);
    const nueva = r.ok ? (r.datos as { composicion?: unknown })?.composicion : null;
    if (typeof nueva === "string") onUpdateSettings?.({ composicion: nueva });
  }
  const total = Math.max(...capas.map((c) => c.inicio + c.duracion), 0.001);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2 text-xs">
      {gsap && !gsap.editableVisualmente ? (<div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 leading-snug">{gsap.motivo}</div>) : null}
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border bg-black/40">
        {!composicion ? (
          <div className="flex h-full items-center justify-center p-2 text-center text-muted-foreground">Sin composición abierta: abre un átomo «vídeo-html» de la Protomolécula o pídesela a Astraura.</div>
        ) : servicio === "vivo" ? (
          <hyperframes-player src={idComposicion ? `http://127.0.0.1:4490/vista/${idComposicion}` : undefined} className="h-full w-full" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-2 text-center text-muted-foreground">
            <span>{servicio === "comprobando" ? "Buscando el servicio HyperFrames de esta neurona…" : "El servicio HyperFrames de esta neurona no responde (127.0.0.1:4490)."}</span>
            {servicio === "caido" && (
              <button type="button" onClick={() => (onAbrirOtraNeurona ? onAbrirOtraNeurona() : window.dispatchEvent(new CustomEvent("starseed:video-abrir-neurona", { detail: { idComposicion } })))} className="cursor-pointer rounded-full border bg-background/60 px-3 py-1 transition-colors hover:bg-background">Abrir en otra neurona</button>
            )}
          </div>
        )}
      </div>
      {composicion ? (
        <div className="flex min-h-0 flex-1 gap-2">
          <div aria-label="Capas" className="min-h-0 w-2/5 overflow-y-auto rounded-lg border p-1">
            {capas.map((c) => (
              <button key={c.id} type="button" onClick={() => abrir(c)} aria-pressed={c.id === seleccion} className={`block w-full cursor-pointer truncate rounded-md px-2 py-1 text-left transition-colors hover:bg-muted ${c.id === seleccion ? "bg-muted font-medium" : ""}`}>
                {c.id} · pista {c.pista} · {c.inicio}s + {c.duracion}s
              </button>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div role="img" aria-label="Línea de tiempo" className="relative h-8 rounded-lg border bg-background/40">
              {capas.map((c) => (
                <div key={c.id} aria-hidden className="absolute inset-y-1 rounded-sm bg-primary/30 ring-1 ring-primary/40" style={{ left: `${(c.inicio / total) * 100}%`, width: `${Math.max((c.duracion / total) * 100, 2)}%` }} />
              ))}
            </div>
            {capa && (
              <div className="rounded-lg border p-2">
                <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Propiedades · {capa.id}</p>
                <div className="grid grid-cols-2 gap-2">                  {([["Texto", panel.texto, (v: string) => setPanel({ ...panel, texto: v })], ["Inicio (s)", panel.inicio, (v: string) => setPanel({ ...panel, inicio: v })], ["Duración (s)", panel.duracion, (v: string) => setPanel({ ...panel, duracion: v })]] as [string, string, (v: string) => void][]).map(([et, val, set]) => (
                    <label key={et} className={et === "Texto" ? "col-span-2 block" : "block"}>
                      {et}
                      <input value={val} onChange={(e) => set(e.target.value)} inputMode={et === "Texto" ? undefined : "decimal"} className="mt-1 w-full rounded-md border bg-transparent px-2 py-1" />
                    </label>
                  ))}
                </div>
                <button type="button" onClick={aplicar} className="mt-2 cursor-pointer rounded-full bg-primary/90 px-3 py-1 text-primary-foreground transition-opacity hover:opacity-90">Aplicar</button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
