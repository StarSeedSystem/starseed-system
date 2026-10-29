'use client';
/**
 * Estudio de vídeo (Ola 1018H · HFR1018K) — ventana/widget del OS para el bloque de vídeo de
 * la Protomolécula. Contrato: architecture/video-hyperframes.md §4: clips y línea de tiempo
 * leídos de los atributos data-* de la composición; panel de propiedades que emite órdenes
 * del SDK; <hyperframes-player> servida por el servicio local de la neurona; sin servicio,
 * mensaje claro y «Abrir en otra neurona»; con GSAP solo se avisa, no se edita (licencia §2).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Clapperboard, MonitorPlay, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import type { SdkOrder } from "@/lib/video-html/operaciones-sdk";
import { detectarAdaptadores } from "@/lib/video-html/adaptadores";
import { SERVICIOS_CONOCIDOS, sondearServicio, llamarServicio, type DefinicionServicio } from "@/lib/protomolecula/servicio-local";

export interface ClipVideo { id: string; etiqueta: string; inicio: number; duracion: number; pista: number }
export interface BorradorClip { texto: string; inicio: string; duracion: string; pista: string }
export type EstadoServicio = { vivo: boolean; motivo: string } | null;
const DEF: DefinicionServicio = SERVICIOS_CONOCIDOS.find((d) => d.id === "hyperframes") ?? { id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/health" };
const numero = (v: string | undefined, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

/** Extrae los clips (class="clip") por sus atributos data-*, en orden de inicio. Puro. */
export function extraerClips(html: string): ClipVideo[] {
  const clips: ClipVideo[] = [];
  for (const m of html.matchAll(/<[A-Za-z][^>]*/g)) {
    const t = m[0];
    if (!/\bclass\s*=\s*"[^"]*\bclip\b/.test(t)) continue;
    const at = (n: string): string | undefined => (t.match(new RegExp(`${n}\\s*=\\s*"([^"]*)"`)) || [])[1];
    const id = at("data-clip-id") || at("id") || `clip-${clips.length + 1}`;
    clips.push({ id, etiqueta: at("data-name") || id, inicio: numero(at("data-start"), 0), duracion: numero(at("data-duration"), 1), pista: numero(at("data-track-index"), 0) });
  }
  return clips.sort((a, b) => a.inicio - b.inicio);
}

/** Órdenes del SDK que le corresponden a un borrador (solo los campos que cambian). Puro. */
export function ordenesDeBorrador(c: ClipVideo, b: BorradorClip): SdkOrder[] {
  const ordenes: SdkOrder[] = [];
  if (b.texto !== c.etiqueta) ordenes.push({ type: "setText", target: c.id, value: b.texto });
  const inicio = numero(b.inicio, c.inicio), duracion = numero(b.duracion, c.duracion);
  if (inicio !== c.inicio || duracion !== c.duracion) ordenes.push({ type: "setTiming", target: c.id, start: inicio, duration: duracion });
  const pista = numero(b.pista, c.pista);
  if (pista !== c.pista) ordenes.push({ type: "setAttribute", target: c.id, name: "data-track-index", value: String(pista) });
  return ordenes;
}
export interface EstudioVideoVentanaProps {
  widget?: DashboardWidget;
  composicion?: string; // composición HyperFrames (HTML); por defecto widget.settings.composicion
  sondear?: () => Promise<{ vivo: boolean; motivo: string }>; // sondeo inyectable (en pruebas no hay red real)
  aplicarOrdenes?: (ordenes: SdkOrder[]) => Promise<void> | void; // órdenes del SDK; si falta: POST /editar
  abrirEnOtraNeurona?: () => void;
}

export function EstudioVideoVentana({ widget, composicion, sondear, aplicarOrdenes, abrirEnOtraNeurona }: EstudioVideoVentanaProps) {
  const html = useMemo(() => composicion ?? String((widget?.settings as { composicion?: string } | undefined)?.composicion ?? ""), [composicion, widget]);
  const [servicio, setServicio] = useState<EstadoServicio>(null);
  const [activa, setActiva] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const clips = useMemo(() => extraerClips(html), [html]);
  const conGsap = useMemo(() => detectarAdaptadores(html).usados.includes("gsap"), [html]);
  useEffect(() => {
    let vivo = true;
    const recibir = (r: { vivo: boolean; motivo: string }) => { if (vivo) setServicio(r); };
    const sondeo = sondear ?? (() => sondearServicio(DEF, (url, init) => fetch(url, init)));
    sondeo().then(recibir).catch(() => recibir({ vivo: false, motivo: "El servicio «hyperframes» no responde en esta neurona." }));
    return () => { vivo = false; };
  }, [sondear]);
  const aplicar = async (ordenes: SdkOrder[]): Promise<void> => {
    if (!ordenes.length || enviando) return;
    setEnviando(true);
    try { if (aplicarOrdenes) await aplicarOrdenes(ordenes); else await llamarServicio(DEF, "/editar", { composicion: html, ordenes }, (url, init) => fetch(url, init)); } catch { /* el fallo queda en el registro del servicio */ } finally { setEnviando(false); }
  };
  const durTotal = Math.max(1, ...clips.map((c) => c.inicio + c.duracion));
  const sel = clips.find((c) => c.id === activa) ?? clips[0] ?? null;
  const barrita = (c: ClipVideo): React.ReactElement => (
    <button key={c.id} type="button" aria-label={`Clip ${c.etiqueta}`} onClick={() => setActiva(c.id)} className={cn("absolute top-0 flex h-5 cursor-pointer items-center overflow-hidden rounded px-1 text-[9px]", c.id === sel?.id ? "bg-[#23d5ab]/40 text-white" : "bg-[#23d5ab]/15 text-slate-300 hover:bg-[#23d5ab]/25")}
      style={{ left: `${(c.inicio / durTotal) * 100}%`, width: `${Math.max(6, (c.duracion / durTotal) * 100)}%` }}>{c.etiqueta}</button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2 text-slate-200">
      <header className="flex items-center gap-2 text-xs">
        <Clapperboard className="size-4 text-[#23d5ab]" /><span className="font-medium">Estudio de vídeo</span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px]", servicio === null ? "bg-white/10 text-slate-400" : servicio.vivo ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>{servicio === null ? "Consultando servicio…" : servicio.vivo ? "Servicio en esta neurona" : "Sin servicio en esta neurona"}</span>
      </header>
      {conGsap && <p role="note" className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">Esta composición usa GSAP: se reproduce y se renderiza, pero su animación no se edita en el editor visual (licencia GSAP Standard).</p>}
      {servicio && !servicio.vivo && (<div className="rounded-md bg-black/30 p-2 ring-1 ring-white/10">
        <p className="text-[11px] text-slate-300">{servicio.motivo} Sin él no hay vista previa ni edición en local.</p><button type="button" onClick={abrirEnOtraNeurona} className="mt-1 cursor-pointer rounded-md bg-[#23d5ab]/20 px-2 py-1 text-[11px] text-[#23d5ab] hover:bg-[#23d5ab]/30">Abrir en otra neurona</button></div>)}
      {html.trim() === "" ? (
        <p className="m-auto text-center text-[11px] text-slate-400"><MonitorPlay className="mx-auto mb-1 size-5" />Crea un átomo «vídeo-html» en la Protomolécula y su estudio aparecerá aquí.</p>
      ) : (<>
        <div role="group" aria-label="Línea de tiempo" className="min-h-0 flex-1">
          {Array.from(new Set(clips.map((c) => c.pista))).sort((a, b) => a - b).map((p) => (
            <div key={p} className="relative mb-1 h-5 rounded bg-black/30 ring-1 ring-white/10"><span className="absolute right-1 top-0 text-[9px] text-slate-500">pista {p}</span>{clips.filter((c) => c.pista === p).map(barrita)}</div>))}
        </div>
        {!servicio?.vivo || !sel ? (
          <div className="flex items-center gap-1 rounded-md bg-black/40 p-2 text-[10px] text-slate-500 ring-1 ring-white/10"><MonitorPlay className="size-4 shrink-0" />La vista previa se sirve con el servicio local «hyperframes»: enciéndelo aquí o ábrelo en otra neurona.</div>
        ) : (<div className="overflow-hidden rounded-md ring-1 ring-white/10" style={{ aspectRatio: "16 / 9", background: "rgba(0,0,0,0.4)" }}>
          {React.createElement("hyperframes-player", { src: `http://127.0.0.1:${DEF.puerto}/vista/${encodeURIComponent(sel.id)}`, className: "block h-full w-full" })}
        </div>)}
      </>)}
      {sel && <Propiedades key={sel.id} clip={sel} enviando={enviando} onAplicar={aplicar} />}
    </div>
  );
}

/** Panel de propiedades del clip activo: al aplicar, emite las órdenes del SDK. */
function Propiedades({ clip, enviando, onAplicar }: { clip: ClipVideo; enviando: boolean; onAplicar: (o: SdkOrder[]) => void }) {
  const [borrador, setBorrador] = useState<BorradorClip>({ texto: clip.etiqueta, inicio: String(clip.inicio), duracion: String(clip.duracion), pista: String(clip.pista) });
  const poner = (k: keyof BorradorClip) => (e: React.ChangeEvent<HTMLInputElement>) => setBorrador((b) => ({ ...b, [k]: e.target.value }));
  const campo = (k: keyof BorradorClip, nombre: string) => (
    <label className="flex items-center gap-1 text-[10px] text-slate-400">{nombre} <input value={borrador[k]} onChange={poner(k)} className="w-16 rounded bg-black/40 px-1 py-0.5 ring-1 ring-white/10 focus:ring-[#23d5ab]/50" /></label>
  );
  return (
    <div className="rounded-md bg-black/30 p-2 text-[10px] ring-1 ring-white/10">
      <div className="mb-1 flex items-center gap-1 font-medium text-slate-300"><Settings2 className="size-3" />Propiedades de «{clip.etiqueta}»</div>
      <div className="flex flex-wrap gap-2">{campo("texto", "Texto")}{campo("inicio", "Inicio (s)")}{campo("duracion", "Duración (s)")}{campo("pista", "Pista")}</div>
      <button type="button" disabled={enviando} onClick={() => onAplicar(ordenesDeBorrador(clip, borrador))} className={cn("mt-1 cursor-pointer rounded-md bg-[#23d5ab]/20 px-2 py-0.5 text-[#23d5ab] hover:bg-[#23d5ab]/30", enviando && "opacity-50")}>{enviando ? "Aplicando…" : "Aplicar"}</button>
    </div>
  );
}
