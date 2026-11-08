"use client";

/**
 * SuperficieLlamada — UNA superficie para toda llamada (voz, vídeo, pantalla, en vivo, grupo) en tres
 * tamaños (burbuja arrastrable, panel, pantalla completa) y seis estados (LLA1108C). No conoce los motores:
 * recibe una `VistaLlamada` y unas `AccionesLlamada`. Contrato: `architecture/llamadas-telefonia.md`.
 */
import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { Circle, Eye, Maximize2, Minimize2, Mic, MicOff, Minus, Monitor, MonitorOff, Pause, Phone, PhoneOff, Play, Radio, Signal, Sparkles, SwitchCamera, UserPlus, Users, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { hayGrabacion, textoIndicador, GRABACION_INICIAL } from "@/lib/llamadas/superficie/grabacion";
import { puedeCambiarTipo, textoEstado, tamanosPermitidos, type TipoSuperficie } from "@/lib/llamadas/superficie/maquina";
import { formatearDuracion, iniciales } from "@/lib/llamadas/formato";
import type { AccionesLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";
import { Barras, BotonControl, Cronometro, Pista, useSalidasAudio } from "./piezas";
import { PestanaAstraura, PestanaCalidad, PestanaGente, PestanaGrabar, PestanaInvitar, PestanaMedio } from "./pestanas";
import { useMovimientoReducido, useSuperficie } from "./use-superficie";

type Pestana = "calidad" | "medio" | "gente" | "invitar" | "grabar" | "astraura";
const TIPOS: Array<{ t: TipoSuperficie; etiqueta: string }> = [
  { t: "voz", etiqueta: "Voz" },
  { t: "video", etiqueta: "Vídeo" },
  { t: "pantalla", etiqueta: "Pantalla" },
  { t: "vivo", etiqueta: "En vivo" },
];
const ic = "h-[18px] w-[18px]";

export function SuperficieLlamada({ vista: v, acciones: a }: { vista: VistaLlamada; acciones: AccionesLlamada }) {
  const { s, despachar, duracion, tamano } = useSuperficie(v);
  const reducido = useMovimientoReducido();
  const salidas = useSalidasAudio();
  const [pestana, setPestana] = useState<Pestana | null>(null);
  const [rejilla, setRejilla] = useState(false);
  const [resaltar, setResaltar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [arrastre, setArrastre] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const raiz = useRef<HTMLElement | null>(null);
  const punto = useRef<{ x: number; y: number; ox: number; oy: number; mov: boolean } | null>(null);
  const [puntero, setPuntero] = useState<{ x: number; y: number } | null>(null);

  // Foco al primer control cuando suena (teclado y lector de pantalla).
  useEffect(() => {
    if (s.estado === "entrante") raiz.current?.querySelector<HTMLElement>("[data-contestar]")?.focus();
  }, [s.estado]);
  useEffect(() => { if (!aviso) return; const id = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(id); }, [aviso]);

  if (s.estado === "inactiva") return null;
  const g = v.grabacion ?? GRABACION_INICIAL;
  const grabando = hayGrabacion(g);
  const viva = s.estado === "conectada" || s.estado === "en-espera" || s.estado === "reconectando";
  const conVideoRemoto = !!v.remoto?.getVideoTracks().length;
  const permitidos = tamanosPermitidos(s.estado);
  const cabeceraTexto = textoEstado(s, v.nombre);
  const tamanoActual = s.tamano;

  const arrastrando = (e: PE<HTMLElement>) => {
    if (tamanoActual !== "burbuja" || (e.target as HTMLElement).closest("button")) return;
    punto.current = { x: e.clientX, y: e.clientY, ox: arrastre.x, oy: arrastre.y, mov: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const moviendo = (e: PE<HTMLElement>) => {
    const p = punto.current;
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) p.mov = true;
    const el = raiz.current;
    const lim = el ? { w: window.innerWidth - el.offsetWidth - 16, h: window.innerHeight - el.offsetHeight - 16 } : { w: 0, h: 0 };
    // Se parte de abajo a la derecha: x e y son desplazamientos negativos hacia arriba/izquierda.
    setArrastre({ x: Math.min(0, Math.max(-lim.w, p.ox + dx)), y: Math.min(0, Math.max(-lim.h, p.oy + dy)) });
  };
  const soltando = () => {
    const p = punto.current;
    punto.current = null;
    if (p && !p.mov) tamano("panel"); // un toque (sin arrastrar) abre el panel
  };
  const teclaBurbuja = (e: React.KeyboardEvent) => {
    if (tamanoActual !== "burbuja") return;
    const paso = e.shiftKey ? 48 : 16;
    const m: Record<string, [number, number]> = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
    if (m[e.key]) { e.preventDefault(); setArrastre((p) => ({ x: Math.min(0, p.x + m[e.key][0]), y: Math.min(0, p.y + m[e.key][1]) })); }
    else if (e.key === "Enter" && e.target === e.currentTarget) tamano("panel");
  };

  const cambiar = async (t: TipoSuperficie) => {
    const ok = puedeCambiarTipo(s, t);
    if (!ok.ok) { setAviso(ok.motivo ?? "No se puede cambiar ahora."); return; }
    despachar({ t: "cambiar-tipo", a: t });
    try { await a.cambiarTipo?.(t); } catch { despachar({ t: "tipo-fallido" }); setAviso("No se pudo cambiar el tipo de llamada; sigue como estaba."); }
  };
  const pip = () => {
    const el = raiz.current?.querySelector<HTMLVideoElement>("video[data-remoto]");
    if (!el || !document.pictureInPictureEnabled) { setAviso("Este navegador no permite imagen en imagen."); return; }
    (document.pictureInPictureElement ? document.exitPictureInPicture() : el.requestPictureInPicture()).catch(() => setAviso("No se pudo abrir la imagen en imagen."));
  };

  const posicion =
    tamanoActual === "pantalla-completa"
      ? "inset-0 rounded-none"
      : s.estado === "entrante"
        ? "left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] w-[min(94vw,400px)] -translate-x-1/2 rounded-3xl sm:left-auto sm:right-5 sm:translate-x-0"
        : tamanoActual === "panel"
          ? "bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 w-[min(94vw,400px)] rounded-3xl max-sm:inset-x-2 max-sm:w-auto"
          : "bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 w-[min(88vw,290px)] rounded-full";
  const pestanas: Array<{ id: Pestana; etiqueta: string; icono: React.ReactNode }> = [
    { id: "calidad", etiqueta: "Calidad", icono: <Signal className="h-3.5 w-3.5" /> },
    { id: "medio", etiqueta: "Medio", icono: <Radio className="h-3.5 w-3.5" /> },
    { id: "gente", etiqueta: "Gente", icono: <Users className="h-3.5 w-3.5" /> },
    { id: "invitar", etiqueta: "Invitar", icono: <UserPlus className="h-3.5 w-3.5" /> },
    { id: "grabar", etiqueta: "Grabar", icono: <Circle className="h-3.5 w-3.5" /> },
    { id: "astraura", etiqueta: "Astraura", icono: <Sparkles className="h-3.5 w-3.5" /> },
  ];
  const completa = tamanoActual === "pantalla-completa";
  const panelAbierto = !!pestana && tamanoActual !== "burbuja";
  const bloquePestana = (
    <div role="tabpanel" id={`pest-${pestana}`} aria-label={pestana ?? ""} className="max-h-[42vh] overflow-auto p-3 md:max-h-none md:flex-1">
      {pestana === "calidad" && <PestanaCalidad v={v} salidas={salidas} />}
      {pestana === "medio" && <PestanaMedio v={v} a={a} />}
      {pestana === "gente" && <PestanaGente v={v} a={a} />}
      {pestana === "invitar" && <PestanaInvitar v={v} a={a} />}
      {pestana === "grabar" && <PestanaGrabar v={v} a={a} />}
      {pestana === "astraura" && <PestanaAstraura v={v} a={a} />}
    </div>
  );

  return (
    <section
      ref={raiz}
      data-testid="superficie-llamada"
      data-tamano={tamanoActual}
      data-estado={s.estado}
      data-tipo={s.tipo}
      role={s.estado === "entrante" ? "alertdialog" : "dialog"}
      aria-modal={completa ? true : undefined}
      aria-live={s.estado === "entrante" ? "assertive" : undefined}
      aria-label={cabeceraTexto || "Llamada"}
      tabIndex={tamanoActual === "burbuja" ? 0 : -1}
      onPointerDown={arrastrando}
      onPointerMove={moviendo}
      onPointerUp={soltando}
      onKeyDown={teclaBurbuja}
      style={tamanoActual === "burbuja" ? { transform: `translate(${arrastre.x}px, ${arrastre.y}px)`, touchAction: "none" } : undefined}
      className={cn(
        "fixed z-[465] flex flex-col overflow-hidden border border-violet-300/25 bg-slate-950/90 text-white shadow-2xl backdrop-blur-xl",
        "bg-[radial-gradient(120%_80%_at_0%_0%,rgba(139,92,246,0.18),transparent_60%),radial-gradient(100%_70%_at_100%_100%,rgba(56,189,248,0.12),transparent_60%)]",
        // Transición interrumpible: siempre hacia el destino actual; sin ella si se pide menos movimiento.
        reducido ? "" : "transition-[width,border-radius,inset,transform] duration-300 ease-out",
        tamanoActual === "burbuja" && "cursor-grab active:cursor-grabbing",
        posicion,
      )}
    >
      {grabando && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-medium text-white shadow-lg" data-testid="indicador-grabando">
          <span className={cn("h-2 w-2 rounded-full bg-white", !reducido && "animate-pulse")} /> Grabando
          <span className="sr-only">{textoIndicador(g, v.yo)}</span>
        </div>
      )}

      {tamanoActual === "burbuja" ? (
        <div className="flex items-center gap-2 py-1.5 pl-2 pr-1.5">
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/40 text-[13px] font-semibold">{iniciales(v.nombre)}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12.5px] font-medium">{v.nombre}</p>
            <p className="truncate text-[11px] text-white/65">{s.estado === "conectada" ? <Cronometro ms={duracion} /> : cabeceraTexto}</p>
          </div>
          <BotonControl pequeno icono={v.micro ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />} etiqueta={v.micro ? "Silenciar micrófono" : "Activar micrófono"} activo={!v.micro} onClick={a.alternarMicro} motivo="no disponible en esta llamada" />
          <BotonControl pequeno peligro icono={<PhoneOff className="h-4 w-4" />} etiqueta="Colgar" onClick={a.colgar} />
        </div>
      ) : (
        <>
          <header className="flex items-center gap-2 px-3 pb-1 pt-3">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/40 text-[12px] font-semibold">{iniciales(v.nombre)}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <h2 className="truncate text-[14px] font-medium">{v.nombre}</h2>
              <p className="truncate text-[11.5px] text-white/65" role="status">
                {viva ? <><Cronometro ms={duracion} /> · {s.estado === "en-espera" ? "en espera" : s.estado === "reconectando" ? "reconectando…" : "conectada"}</> : cabeceraTexto}
              </p>
            </div>
            {viva && v.calidad && (
              <button type="button" onClick={() => setPestana((p) => (p === "calidad" ? null : "calidad"))} aria-label={`Calidad: ${v.calidad.texto}`} className="cursor-pointer rounded-lg p-1.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80">
                <Barras n={v.calidad.barras} texto={v.calidad.texto} />
              </button>
            )}
            {permitidos.includes("burbuja") && <BotonControl pequeno icono={<Minus className="h-4 w-4" />} etiqueta="Reducir a burbuja" onClick={() => tamano("burbuja")} />}
            <BotonControl pequeno icono={completa ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} etiqueta={completa ? "Salir de pantalla completa (Esc)" : "Pantalla completa"} onClick={() => despachar({ t: "alternar-completa" })} />
          </header>

          <div className={cn("flex min-h-0 flex-1", completa ? "flex-col md:flex-row landscape:flex-row" : "flex-col")}>
            <div className={cn("relative flex min-w-0 flex-1 flex-col", completa && "min-h-[40vh]")}>
              {(s.tipo === "video" || s.tipo === "pantalla" || s.tipo === "vivo" || s.tipo === "grupo") && viva ? (
                <div className={cn("relative mx-3 my-2 overflow-hidden rounded-2xl bg-black", completa ? "flex-1" : "aspect-video")}>
                  <div className={cn("h-full w-full", rejilla && (v.participantes?.length ?? 0) > 1 && "grid grid-cols-2 gap-1")}>
                    {rejilla && v.participantes?.length ? v.participantes.map((p) => (
                      <div key={p.id} className="relative overflow-hidden rounded-lg bg-slate-900">
                        <Pista stream={p.stream} video silenciar={p.yo} className="h-full w-full" etiqueta={p.nombre} />
                        <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 text-[10.5px]">{p.nombre}</span>
                      </div>
                    )) : <Pista stream={v.remoto} video={conVideoRemoto} remoto className="h-full w-full object-contain" etiqueta={`Imagen de ${v.nombre}`} sinkId={salidas.elegida} />}
                  </div>
                  {s.tipo === "pantalla" && resaltar && puntero && <span aria-hidden className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 bg-amber-300/25" style={{ left: puntero.x, top: puntero.y }} />}
                  {s.tipo === "pantalla" && resaltar && <div className="absolute inset-0" onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPuntero({ x: e.clientX - r.left, y: e.clientY - r.top }); }} />}
                  {v.local && v.camara && <Pista stream={v.local} video silenciar className="absolute bottom-2 right-2 h-20 w-14 rounded-lg border border-white/25 sm:h-24 sm:w-32" etiqueta="Tu cámara" />}
                  {s.tipo === "vivo" && <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px]"><Eye className="h-3 w-3" /> {v.espectadores ?? "—"} · {v.relevo ?? "directo"}</span>}
                  {s.estado === "reconectando" && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/60 text-[13px]">Reconectando…</div>}
                  {s.estado === "en-espera" && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/60 text-[13px]">En espera</div>}
                  <Pista stream={v.remoto} video={false} sinkId={salidas.elegida} />
                </div>
              ) : (
                <div className={cn("flex flex-col items-center justify-center gap-2 py-6", completa && "flex-1")}>
                  <span aria-hidden className={cn("flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/35 text-2xl font-semibold ring-4 ring-violet-300/20", (s.estado === "entrante" || s.estado === "saliente") && !reducido && "animate-pulse")}>{iniciales(v.nombre)}</span>
                  <p className="text-[13px] text-white/80">{s.estado === "terminada" ? `Duración ${formatearDuracion(s.duracionMs ?? 0)}${s.medioUsado ? ` · por ${s.medioUsado}` : ""}` : viva ? "Solo audio" : cabeceraTexto}</p>
                  <Pista stream={v.remoto} video={false} sinkId={salidas.elegida} />
                </div>
              )}
              {v.motivo && <p className="px-3 pb-1 text-[11.5px] text-white/65" role="status">{v.motivo}</p>}
              {aviso && <p className="mx-3 mb-1 rounded-lg border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[11.5px] text-amber-100" role="status">{aviso}</p>}
              {v.textoMedio && viva && <p className="px-3 pb-1 text-[11px] text-white/55">{v.textoMedio}</p>}
              {v.cambiandoA && <p className="px-3 pb-1 text-[11.5px] text-violet-100" role="status">Cambiando a {TIPOS.find((t) => t.t === v.cambiandoA)?.etiqueta.toLowerCase()} sin colgar…</p>}
            </div>

            {panelAbierto && <aside className={cn("border-t border-white/10 md:border-l md:border-t-0", completa ? "md:flex md:w-[340px] md:flex-col" : "")}>{bloquePestana}</aside>}
          </div>

          {viva && (
            <div role="radiogroup" aria-label="Tipo de llamada" className="mx-3 mb-1 flex gap-1 rounded-full bg-white/[0.06] p-0.5">
              {TIPOS.map(({ t, etiqueta }) => {
                const sel = s.tipo === t;
                const puede = puedeCambiarTipo(s, t);
                return (
                  <button key={t} type="button" role="radio" aria-checked={sel} disabled={!sel && (!puede.ok || !a.cambiarTipo)} title={!sel && !puede.ok ? puede.motivo : undefined} onClick={() => !sel && void cambiar(t)} className={cn("flex-1 cursor-pointer rounded-full px-2 py-1 text-[11.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 disabled:cursor-not-allowed disabled:opacity-40", sel ? "bg-violet-400/35 text-white" : "text-white/70 hover:bg-white/10")}>{etiqueta}</button>
                );
              })}
            </div>
          )}

          {viva && (
            <div role="tablist" aria-label="Más de la llamada" className="mx-3 flex gap-1 overflow-x-auto pb-1">
              {pestanas.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} aria-controls={`pest-${p.id}`} onClick={() => setPestana((x) => (x === p.id ? null : p.id))} className={cn("inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80", pestana === p.id ? "border-violet-300/60 bg-violet-400/25" : "border-white/10 text-white/75 hover:bg-white/10", p.id === "grabar" && grabando && "border-rose-400/60 text-rose-100")}>
                  {p.icono} {p.etiqueta}
                </button>
              ))}
            </div>
          )}

          <footer className="flex flex-wrap items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
            {s.estado === "entrante" && (
              <>
                <BotonControl peligro icono={<PhoneOff className={ic} />} etiqueta="Rechazar" onClick={a.rechazar} />
                <button type="button" data-contestar onClick={() => void a.contestar?.()} disabled={!a.contestar} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-emerald-300/50 bg-emerald-500/80 px-5 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:opacity-40"><Phone className={ic} /> Contestar</button>
              </>
            )}
            {s.estado === "saliente" && <BotonControl peligro icono={<PhoneOff className={ic} />} etiqueta="Cancelar llamada" onClick={a.colgar} />}
            {viva && (
              <>
                <BotonControl icono={v.micro ? <Mic className={ic} /> : <MicOff className={ic} />} etiqueta={v.micro ? "Silenciar micrófono" : "Activar micrófono"} activo={!v.micro} onClick={a.alternarMicro} motivo="no disponible" />
                <BotonControl icono={v.camara ? <Video className={ic} /> : <VideoOff className={ic} />} etiqueta={v.camara ? "Apagar cámara" : "Encender cámara"} activo={!v.camara} onClick={a.alternarCamara} motivo="esta llamada no lleva cámara; cambia a Vídeo" />
                {(v.camaras ?? 0) > 1 && <BotonControl icono={<SwitchCamera className={ic} />} etiqueta="Girar cámara (frontal/trasera)" onClick={a.girarCamara} />}
                <BotonControl icono={v.compartiendoPantalla ? <MonitorOff className={ic} /> : <Monitor className={ic} />} etiqueta={v.compartiendoPantalla ? "Dejar de compartir pantalla" : "Compartir pantalla (elige ventana o pantalla)"} activo={v.compartiendoPantalla} onClick={a.alternarPantalla} motivo="no disponible en esta llamada" />
                <BotonControl icono={s.estado === "en-espera" ? <Play className={ic} /> : <Pause className={ic} />} etiqueta={s.estado === "en-espera" ? "Reanudar llamada" : "Poner en espera"} activo={s.estado === "en-espera"} onClick={a.alternarEspera} motivo="la llamada directa aún no admite espera" />
                {(s.tipo === "video" || s.tipo === "grupo") && <BotonControl icono={<Users className={ic} />} etiqueta={rejilla ? "Vista de orador" : "Vista en rejilla"} activo={rejilla} onClick={() => setRejilla((x) => !x)} />}
                {conVideoRemoto && <BotonControl icono={<Maximize2 className={ic} />} etiqueta="Imagen en imagen" onClick={pip} />}
                {s.tipo === "pantalla" && <BotonControl icono={<Circle className={ic} />} etiqueta={resaltar ? "Quitar resaltado del puntero" : "Resaltar el puntero"} activo={resaltar} onClick={() => setResaltar((x) => !x)} />}
                <BotonControl peligro icono={<PhoneOff className={ic} />} etiqueta="Colgar" onClick={a.colgar} />
              </>
            )}
            {s.estado === "terminada" && <button type="button" onClick={() => { a.descartar?.(); despachar({ t: "descartar" }); }} className="cursor-pointer rounded-full border border-white/20 bg-white/10 px-5 py-2 text-[13px] hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80">Cerrar</button>}
          </footer>
        </>
      )}
    </section>
  );
}
