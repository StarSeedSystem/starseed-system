"use client";

/**
 * SuperficieLlamada — UNA superficie para toda llamada (voz, vídeo, pantalla, en vivo, grupo) en tres
 * tamaños (burbuja arrastrable, panel, pantalla completa) y seis estados (LLA1108C). No conoce los motores:
 * recibe una `VistaLlamada` y unas `AccionesLlamada`. Contrato: `architecture/llamadas-telefonia.md`.
 */
import { useEffect, useRef, useState, type PointerEvent as PE } from "react";
import { Circle, Eye, Maximize2, MessageSquare, Minimize2, Mic, MicOff, Minus, Monitor, MonitorOff, Pause, PictureInPicture2, Phone, PhoneOff, Play, Radio, Signal, Smile, Sparkles, SwitchCamera, UserPlus, Users, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { hayGrabacion, textoIndicador, GRABACION_INICIAL } from "@/lib/llamadas/superficie/grabacion";
import { puedeCambiarTipo, textoEstado, tamanosPermitidos, type TipoSuperficie } from "@/lib/llamadas/superficie/maquina";
import { formatearDuracion, iniciales } from "@/lib/llamadas/formato";
import type { AccionesLlamada, VistaLlamada } from "@/lib/llamadas/superficie/vista";
import { EMOJIS_REACCION } from "@/lib/llamadas/superficie/senales-app";
import { accionDeTecla, AYUDA_ATAJOS } from "@/lib/llamadas/superficie/atajos";
import { Barras, BotonControl, Cronometro, ImagenRemota, Pista, useSalidasAudio } from "./piezas";
import { PestanaAstraura, PestanaCalidad, PestanaChat, PestanaGente, PestanaGrabar, PestanaInvitar, PestanaMedio } from "./pestanas";
import estilos from "../llamadas.module.css";
import { useMovimientoReducido, useSuperficie } from "./use-superficie";
import { vigilarVisibilidad } from "@/lib/llamadas/superficie/visibilidad";
import { streamTraeVideo } from "@/lib/llamadas/superficie/adaptador-motor";
import type { FuenteCarriles } from "./carriles-eleccion";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";
import { ATRIBUTO_VENTANA_LLAMADA, registrarVentanaLlamada } from "@/lib/llamadas/superficie/zona-llamada"; // LLA1112B

/**
 * LLA1110C: ¿el flujo trae vídeo CON imagen ahora? Una pista WebRTC negociada sin ruta (por Bluetooth) existe pero
 * llega «muted» para siempre: contarla como vídeo dejaba un <video> negro encima de todo. Se escucha mute/unmute.
 */
function useTraeVideo(stream: MediaStream | null | undefined): boolean {
  const [si, setSi] = useState(() => streamTraeVideo(stream));
  useEffect(() => {
    const revisar = () => setSi(streamTraeVideo(stream));
    revisar();
    if (!stream) return;
    const pistas = new Set<MediaStreamTrack>();
    const enganchar = () => {
      for (const t of stream.getVideoTracks()) {
        if (pistas.has(t)) continue;
        pistas.add(t);
        t.addEventListener("mute", revisar);
        t.addEventListener("unmute", revisar);
        t.addEventListener("ended", revisar);
      }
      revisar();
    };
    enganchar();
    stream.addEventListener?.("addtrack", enganchar);
    stream.addEventListener?.("removetrack", revisar);
    // Por si el motor no avisa (algunos WebView no emiten «unmute»): una mirada cada segundo.
    const id = setInterval(revisar, 1000);
    return () => {
      clearInterval(id);
      stream.removeEventListener?.("addtrack", enganchar);
      stream.removeEventListener?.("removetrack", revisar);
      for (const t of pistas) {
        t.removeEventListener("mute", revisar);
        t.removeEventListener("unmute", revisar);
        t.removeEventListener("ended", revisar);
      }
    };
  }, [stream]);
  return si;
}

type Pestana = "calidad" | "medio" | "gente" | "invitar" | "grabar" | "astraura" | "chat";
const TIPOS: Array<{ t: TipoSuperficie; etiqueta: string }> = [
  { t: "voz", etiqueta: "Voz" },
  { t: "video", etiqueta: "Vídeo" },
  { t: "pantalla", etiqueta: "Pantalla" },
  { t: "vivo", etiqueta: "En vivo" },
];
const ic = "h-[18px] w-[18px]";
/**
 * LLA1111A · la ventana nunca es más alta que lo visible menos las zonas seguras y el margen de 1 rem arriba y abajo
 * (antes crecía hacia arriba con un panel abierto y la cabecera se salía de la pantalla). `dvh` sigue a la barra del
 * navegador del móvil; donde no exista, el `vh` de antes.
 */
const ALTO_MAXIMO = "calc(100dvh - max(1rem, env(safe-area-inset-top)) - max(1rem, env(safe-area-inset-bottom)))";

export function SuperficieLlamada({ vista: v, acciones: a, tamanoInicial, carriles }: { vista: VistaLlamada; acciones: AccionesLlamada; /** Tamaño al conectar (por defecto la burbuja discreta de la llamada directa). */ tamanoInicial?: "panel" | "pantalla-completa"; /** LLA1111A: el motor, para elegir a mano el carril de cada flujo en «Medio». */ carriles?: FuenteCarriles | null }) {
  const { s, despachar, duracion, tamano } = useSuperficie(v);
  const reducido = useMovimientoReducido();
  const salidas = useSalidasAudio();
  const [pestana, setPestana] = useState<Pestana | null>(null);
  const [rejilla, setRejilla] = useState(false);
  const [espejo, setEspejo] = useState(true); // VID1110A: mi imagen como espejo
  const [resaltar, setResaltar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [reaccionando, setReaccionando] = useState(false);
  const inicialAplicado = useRef(false);
  const [arrastre, setArrastre] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const raiz = useRef<HTMLElement | null>(null);
  const punto = useRef<{ x: number; y: number; ox: number; oy: number; mov: boolean } | null>(null);
  const [puntero, setPuntero] = useState<{ x: number; y: number } | null>(null);

  // LLA1112B: mientras la ventana existe, el dock y los sensores de borde la respetan (`zona-llamada.ts`).
  useEffect(() => registrarVentanaLlamada(), []);

  // Foco al primer control cuando suena (teclado y lector de pantalla).
  useEffect(() => {
    if (s.estado === "entrante") raiz.current?.querySelector<HTMLElement>("[data-contestar]")?.focus();
  }, [s.estado]);
  // LLA1112B: un aviso nuevo se trae a la vista (con «Puertos» abierto y desplazado quedaba fuera y la persona no veía por qué volvió la cámara).
  const refAviso = useRef<HTMLParagraphElement | null>(null);
  const textoAviso = aviso ?? v.aviso ?? null;
  useEffect(() => { if (textoAviso) refAviso.current?.scrollIntoView?.({ block: "nearest" }); }, [textoAviso]);
  useEffect(() => { if (!aviso) return; const id = setTimeout(() => setAviso(null), 6000); return () => clearTimeout(id); }, [aviso]);
  // LLA1111A: al abrir una pestaña en una pantalla baja, el cuerpo de la ventana se desplaza hasta ella (sin mover la página).
  useEffect(() => {
    if (!pestana) return;
    const cuerpo = raiz.current?.querySelector<HTMLElement>("[data-cuerpo-llamada]");
    const panel = raiz.current?.querySelector<HTMLElement>("[data-panel-llamada]");
    if (!cuerpo || !panel || cuerpo.scrollHeight <= cuerpo.clientHeight) return;
    const delta = panel.getBoundingClientRect().top - cuerpo.getBoundingClientRect().top;
    if (delta > 0) cuerpo.scrollTop += delta - 8;
  }, [pestana]);

  useEffect(() => {
    if (s.estado === "conectada" && tamanoInicial && !inicialAplicado.current) {
      inicialAplicado.current = true;
      tamano(tamanoInicial);
    }
    if (s.estado === "inactiva" || s.estado === "terminada") inicialAplicado.current = false;
  }, [s.estado, tamanoInicial, tamano]);

  // Atajos de escritorio: M micro, V cámara, S pantalla, F pantalla completa (no al escribir ni con la llamada sin conectar).
  const vivaAtajos = s.estado === "conectada" || s.estado === "en-espera";
  const refAcc = useRef({ v, a });
  refAcc.current = { v, a };
  useEffect(() => {
    if (!vivaAtajos) return;
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const acc = accionDeTecla({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, repeat: e.repeat, etiqueta: t?.tagName, editable: !!t?.isContentEditable }, true);
      if (!acc) return;
      const { v: vv, a: aa } = refAcc.current;
      e.preventDefault();
      if (acc === "micro") aa.alternarMicro?.();
      else if (acc === "completa") despachar({ t: "alternar-completa" });
      else {
        const motivo = acc === "camara" ? vv.motivos?.camara : vv.motivos?.pantalla;
        const accion = acc === "camara" ? aa.alternarCamara : aa.alternarPantalla;
        if (!accion) setAviso(acc === "camara" ? "Esta llamada no lleva cámara." : "Esta llamada no puede compartir pantalla.");
        else if (motivo && !(acc === "pantalla" && vv.compartiendoPantalla)) setAviso(motivo);
        else accion();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [vivaAtajos, despachar]);

  const remotoTraeVideo = useTraeVideo(v.remoto);
  // LLA1111A: el <video> del otro avisa si pinta cuadros de verdad (una pista WebRTC puede seguir «muted» con imagen).
  const [videoPinta, setVideoPinta] = useState(false);
  // LLA1110C: hay imagen del otro si el lienzo del vídeo ligero está o si su pista de vídeo trae imagen DE VERDAD.
  const conVideoRemoto = !!v.remotoLienzo || remotoTraeVideo || videoPinta;
  const vivaVideo = s.estado === "conectada" || s.estado === "en-espera" || s.estado === "reconectando";
  // LLA1110C: al llegar imagen del otro con la llamada recogida en la burbuja, se abre el panel (antes se veía la píldora).
  const habiaVideo = useRef(false);
  useEffect(() => {
    if (conVideoRemoto && !habiaVideo.current && vivaVideo && s.tamano === "burbuja") tamano("panel");
    habiaVideo.current = conVideoRemoto;
  }, [conVideoRemoto, vivaVideo, s.tamano, tamano]);
  // LLA1110C: telemetría de visibilidad de cada mosaico con imagen (registro del enlace), cada 5 s.
  const quiereVideo = vivaVideo && (conVideoRemoto || v.camara || !!v.remoto?.getVideoTracks().length);
  useEffect(() => {
    if (!quiereVideo) return;
    return vigilarVisibilidad(() => raiz.current, (l) => anotarLlamada("medio=video-datos", null, l), 5000);
  }, [quiereVideo]);

  if (s.estado === "inactiva") return null;
  const g = v.grabacion ?? GRABACION_INICIAL;
  const grabando = hayGrabacion(g);
  const viva = vivaVideo;
  const permitidos = tamanosPermitidos(s.estado);
  const cabeceraTexto = textoEstado(s, v.nombre);
  const tamanoActual = s.tamano;
  const hablando = !!v.participantes?.some((p) => !p.yo && (p.nivel ?? 0) > 0.08);

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
    // LLA1110C: el motivo real (p. ej. por qué no se encendió la cámara), no un «no se pudo» genérico.
    try { await a.cambiarTipo?.(t); } catch (err) { despachar({ t: "tipo-fallido" }); const m = err instanceof Error && err.message ? err.message : ""; setAviso(m ? `No se pudo cambiar a ${TIPOS.find((x) => x.t === t)?.etiqueta.toLowerCase() ?? t}: ${m}` : "No se pudo cambiar el tipo de llamada; sigue como estaba."); }
  };
  const pip = () => {
    const el = raiz.current?.querySelector<HTMLVideoElement>("video[data-remoto]");
    if (!el || !document.pictureInPictureEnabled) { setAviso(v.motivos?.pip ?? "Este navegador no permite imagen en imagen."); return; }
    (document.pictureInPictureElement ? document.exitPictureInPicture() : el.requestPictureInPicture()).catch(() => setAviso("No se pudo abrir la imagen en imagen."));
  };

  const posicion =
    tamanoActual === "pantalla-completa"
      ? "inset-0 rounded-none"
      : s.estado === "entrante"
        ? "left-1/2 top-[max(0.75rem,env(safe-area-inset-top))] w-[min(94vw,400px)] -translate-x-1/2 rounded-3xl sm:left-auto sm:right-5 sm:translate-x-0"
        : tamanoActual === "panel"
          ? "bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 w-[min(94vw,400px)] rounded-3xl max-sm:inset-x-2 max-sm:w-auto [@media(max-height:520px)_and_(min-width:640px)]:w-[min(94vw,600px)]"
          : "bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 w-[min(88vw,290px)] rounded-full";
  const pestanas: Array<{ id: Pestana; etiqueta: string; icono: React.ReactNode }> = [
    // LLA1111A: el botón se llama «Puertos» (el id interno sigue siendo «calidad»).
    { id: "calidad", etiqueta: "Puertos", icono: <Signal className="h-3.5 w-3.5" /> },
    { id: "medio", etiqueta: "Medio", icono: <Radio className="h-3.5 w-3.5" /> },
    { id: "gente", etiqueta: "Gente", icono: <Users className="h-3.5 w-3.5" /> },
    { id: "invitar", etiqueta: "Invitar", icono: <UserPlus className="h-3.5 w-3.5" /> },
    { id: "grabar", etiqueta: "Grabar", icono: <Circle className="h-3.5 w-3.5" /> },
    { id: "astraura", etiqueta: "Astraura", icono: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "chat", etiqueta: "Chat", icono: <MessageSquare className="h-3.5 w-3.5" /> },
  ];
  const completa = tamanoActual === "pantalla-completa";
  const panelAbierto = !!pestana && tamanoActual !== "burbuja";
  const bloquePestana = (
    <div role="tabpanel" id={`pest-${pestana}`} aria-label={pestanas.find((p) => p.id === pestana)?.etiqueta ?? ""} className={cn("p-3", completa && "md:min-h-0 md:flex-1 md:overflow-y-auto")} data-panel-llamada="">
      {pestana === "calidad" && <PestanaCalidad v={v} a={a} salidas={salidas} espejo={espejo} onEspejo={setEspejo} />}
      {pestana === "medio" && <PestanaMedio v={v} a={a} carriles={carriles} />}
      {pestana === "gente" && <PestanaGente v={v} a={a} />}
      {pestana === "invitar" && <PestanaInvitar v={v} a={a} />}
      {pestana === "grabar" && <PestanaGrabar v={v} a={a} />}
      {pestana === "astraura" && <PestanaAstraura v={v} a={a} />}
      {pestana === "chat" && <PestanaChat v={v} a={a} />}
    </div>
  );

  return (
    <section
      ref={raiz}
      data-testid="superficie-llamada"
      {...{ [ATRIBUTO_VENTANA_LLAMADA]: "" }}
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
      style={{ ...(tamanoActual === "burbuja" ? { transform: `translate(${arrastre.x}px, ${arrastre.y}px)`, touchAction: "none" } : {}), ...(completa ? {} : { maxHeight: ALTO_MAXIMO }) }}
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
          <header className={cn("flex shrink-0 items-center gap-2 px-3 pb-1", completa ? "pt-[max(0.75rem,env(safe-area-inset-top))]" : "pt-3")}>
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500/40 text-[12px] font-semibold">{iniciales(v.nombre)}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <h2 className="truncate text-[14px] font-medium">{v.nombre}</h2>
              <p className="truncate text-[11.5px] text-white/65" role="status">
                {viva ? <><Cronometro ms={duracion} /> · {s.estado === "en-espera" ? "en espera" : s.estado === "reconectando" ? "reconectando…" : "conectada"}</> : cabeceraTexto}
              </p>
            </div>
            {viva && v.calidad && (
              <button type="button" onClick={() => setPestana((p) => (p === "calidad" ? null : "calidad"))} aria-label={`Puertos: ${v.calidad.texto}`} className="cursor-pointer rounded-lg p-1.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80">
                <Barras n={v.calidad.barras} texto={v.calidad.texto} />
              </button>
            )}
            {permitidos.includes("burbuja") && <BotonControl pequeno icono={<Minus className="h-4 w-4" />} etiqueta="Reducir a burbuja" onClick={() => tamano("burbuja")} />}
            <BotonControl pequeno icono={completa ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} etiqueta={completa ? "Salir de pantalla completa (Esc)" : "Pantalla completa"} onClick={() => despachar({ t: "alternar-completa" })} />
          </header>

          {/* LLA1111A: lo de en medio (imagen, avisos y el panel abierto) se desplaza DENTRO de la ventana; la cabecera y los controles quedan fijos. */}
          <div className={cn("flex min-h-0 flex-1 overscroll-contain", completa ? "flex-col overflow-y-auto md:flex-row md:overflow-hidden" : "flex-col overflow-y-auto")} data-cuerpo-llamada="">
            <div className={cn("relative flex min-w-0 flex-col", completa ? "min-h-[40vh] flex-1 md:min-h-0" : "shrink-0")}>
              <div key={s.tipo} className={cn("flex min-h-0 flex-1 flex-col", !reducido && estilos.entraTipo)} data-layout={s.tipo}>
              {(s.tipo === "video" || s.tipo === "pantalla" || s.tipo === "vivo" || s.tipo === "grupo") && viva ? (
                <div className={cn("relative mx-3 my-2 shrink-0 overflow-hidden rounded-2xl bg-black", completa ? "flex-1" : "aspect-video")} style={!completa && panelAbierto ? { maxHeight: "22dvh" } : undefined}>
                  <div className={cn("h-full w-full", rejilla && (v.participantes?.length ?? 0) > 1 && "grid grid-cols-2 gap-1")}>
                    {rejilla && v.participantes?.length ? v.participantes.map((p) => (
                      <div key={p.id} className={cn("relative overflow-hidden rounded-lg bg-slate-900", p.nivel && p.nivel > 0.08 && "ring-2 ring-emerald-300/70")}>
                        <Pista stream={p.stream} lienzo={p.lienzo} video silenciar className="h-full w-full" etiqueta={p.nombre} />
                        <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 text-[10.5px]">{p.nombre}</span>
                      </div>
                    )) : <ImagenRemota stream={v.remoto} lienzo={v.remotoLienzo} silenciar={!!v.participantes?.length} className="h-full w-full" etiqueta={s.tipo === "pantalla" ? `Pantalla de ${v.nombre}` : `Imagen de ${v.nombre}`} sinkId={salidas.elegida} alPintar={setVideoPinta} alVideoPinta={a.videoWebPinta} vencerMs={s.tipo === "pantalla" ? 12_000 : 2000} />}
                  </div>
                  {!conVideoRemoto && !rejilla && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[13px] text-white/80">
                      <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/35 text-xl font-semibold">{iniciales(v.nombre)}</span>
                      {s.tipo === "pantalla" ? "Esperando la pantalla…" : "Sin imagen todavía"}
                    </div>
                  )}
                  {s.tipo === "pantalla" && resaltar && puntero && <span aria-hidden className="pointer-events-none absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300 bg-amber-300/25" style={{ left: puntero.x, top: puntero.y }} />}
                  {s.tipo === "pantalla" && resaltar && <div className="absolute inset-0" onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPuntero({ x: e.clientX - r.left, y: e.clientY - r.top }); }} />}
                  {v.local && v.camara && <Pista stream={v.local} video silenciar local espejo={espejo} className="absolute bottom-2 right-2 h-20 w-14 rounded-lg border border-white/25 sm:h-24 sm:w-32" etiqueta="Tu cámara" />}
                  {s.tipo === "vivo" && <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px]"><Eye className="h-3 w-3" /> {v.espectadores ?? "—"} · {v.relevo ?? "directo"}</span>}
                  {s.tipo === "pantalla" && v.compartiendoPantalla && <span className="absolute left-2 top-2 rounded-full bg-amber-500/80 px-2 py-0.5 text-[11px] text-black">Estás compartiendo tu pantalla</span>}
                  {s.estado === "reconectando" && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/60 text-[13px]">Reconectando…</div>}
                  {s.estado === "en-espera" && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/60 text-[13px]">En espera</div>}
                  {!v.participantes?.length && <Pista stream={v.remoto} video={false} sinkId={salidas.elegida} />}
                </div>
              ) : (
                <div className={cn("flex flex-col items-center justify-center gap-2 py-6", completa && "flex-1")}>
                  <span aria-hidden className={cn("flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/35 text-2xl font-semibold ring-4 transition-[box-shadow,--tw-ring-color] duration-200", hablando ? "ring-emerald-300/80" : "ring-violet-300/20", (s.estado === "entrante" || s.estado === "saliente") && !reducido && "animate-pulse")} data-hablando={hablando ? "" : undefined}>{iniciales(v.nombre)}</span>
                  <p className="text-[13px] text-white/80">{s.estado === "terminada" ? `Duración ${formatearDuracion(s.duracionMs ?? 0)}${s.medioUsado ? ` · por ${s.medioUsado}` : ""}` : viva ? (hablando ? "Hablando…" : "Solo audio") : cabeceraTexto}</p>
                  {!v.participantes?.length && <Pista stream={v.remoto} video={false} sinkId={salidas.elegida} />}
                </div>
              )}
              </div>
              {s.tipo === "pantalla" && viva && (v.participantes?.length ?? 0) > 1 && (
                <ul aria-label="Participantes" className="mx-3 mb-1 flex gap-1.5 overflow-x-auto">
                  {v.participantes?.map((p) => <li key={p.id} className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[11px]", p.nivel && p.nivel > 0.08 ? "border-emerald-300/70 text-emerald-100" : "border-white/10 text-white/70")}>{p.yo ? "Tú" : p.nombre}</li>)}
                </ul>
              )}
              {v.participantes?.filter((p) => !p.yo).map((p) => <Pista key={p.id} stream={p.stream} video={false} volumen={p.volumen} sinkId={salidas.elegida} />)}
              {v.chip && viva && <p role="status" className="pointer-events-none mx-auto mb-1 w-fit rounded-full border border-violet-300/30 bg-violet-400/15 px-3 py-0.5 text-[11.5px] text-violet-50" data-testid="chip-transmision">{v.chip}</p>}
              {(v.reacciones?.length ?? 0) > 0 && (
                <div aria-live="polite" className="pointer-events-none absolute bottom-2 left-3 flex gap-2">
                  {v.reacciones?.map((r) => <span key={r.id} title={r.nombre} className={cn("text-2xl", !reducido && estilos.reaccion)}>{r.emoji}<span className="sr-only"> {r.nombre}</span></span>)}
                </div>
              )}
              {v.motivo && <p className="px-3 pb-1 text-[11.5px] text-white/65" role="status">{v.motivo}</p>}
              {(aviso ?? v.aviso) && <p ref={refAviso} className="mx-3 mb-1 rounded-lg border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[11.5px] text-amber-100" role="status">{aviso ?? v.aviso}</p>}
              {v.textoMedio && viva && <p className="px-3 pb-1 text-[11px] text-white/55">{v.textoMedio}</p>}
              {v.textoCarriles && viva && <p className="px-3 pb-1 text-[11px] text-white/55" data-carriles="">{v.textoCarriles}</p>}
              {v.cambiandoA && <p className="px-3 pb-1 text-[11.5px] text-violet-100" role="status">Cambiando a {TIPOS.find((t) => t.t === v.cambiandoA)?.etiqueta.toLowerCase()} sin colgar…</p>}
            </div>

            {panelAbierto && <aside className={cn("shrink-0 border-t border-white/10", completa ? "md:flex md:min-h-0 md:w-[340px] md:flex-col md:border-l md:border-t-0" : "")}>{bloquePestana}</aside>}
          </div>

          {viva && (
            <div role="radiogroup" aria-label="Tipo de llamada" className="mx-3 mb-1 mt-1 flex shrink-0 gap-1 rounded-full bg-white/[0.06] p-0.5">
              {TIPOS.map(({ t, etiqueta }) => {
                const sel = s.tipo === t;
                const puede = puedeCambiarTipo(s, t);
                const motivoMatriz = v.motivos?.[`tipo-${t}` as keyof NonNullable<typeof v.motivos>];
                const razon = !puede.ok ? puede.motivo : motivoMatriz;
                return (
                  <button key={t} type="button" role="radio" aria-checked={sel} disabled={!sel && (!puede.ok || !a.cambiarTipo || !!motivoMatriz)} title={!sel && razon ? razon : undefined} onClick={() => !sel && void cambiar(t)} className={cn("flex-1 cursor-pointer rounded-full px-2 py-1 text-[11.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 disabled:cursor-not-allowed disabled:opacity-40", sel ? "bg-violet-400/35 text-white" : "text-white/70 hover:bg-white/10")}>{etiqueta}</button>
                );
              })}
            </div>
          )}

          {viva && (
            <div role="tablist" aria-label="Más de la llamada" className="mx-3 flex shrink-0 flex-nowrap gap-1 overflow-x-auto pb-1">
              {pestanas.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id} aria-controls={`pest-${p.id}`} onClick={() => setPestana((x) => (x === p.id ? null : p.id))} className={cn("inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80", pestana === p.id ? "border-violet-300/60 bg-violet-400/25" : "border-white/10 text-white/75 hover:bg-white/10", p.id === "grabar" && grabando && "border-rose-400/60 text-rose-100")}>
                  {p.icono} {p.etiqueta}
                </button>
              ))}
            </div>
          )}

          {viva && <p className="sr-only">{AYUDA_ATAJOS}</p>}
          <footer className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2" data-controles-llamada="">
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
                <BotonControl icono={v.camara ? <Video className={ic} /> : <VideoOff className={ic} />} etiqueta={a.alternarCamara ? (v.camara ? "Apagar cámara" : "Encender cámara") : v.camara ? "Cámara encendida" : "Cámara apagada"} activo={!v.camara} onClick={a.alternarCamara} deshabilitado={!v.camara && !!v.motivos?.camara} motivo={v.motivos?.camara ?? (v.tipo === "voz" ? "esta llamada es de voz; para añadir vídeo pulsa «Vídeo» o «Encender cámara»" : "esta llamada no permite cambiar la cámara desde aquí")} />
                {(v.camaras ?? 0) > 1 && <BotonControl icono={<SwitchCamera className={ic} />} etiqueta="Girar cámara (frontal/trasera)" onClick={a.girarCamara} deshabilitado={!!v.motivos?.["girar-camara"]} motivo={v.motivos?.["girar-camara"]} />}
                <BotonControl icono={v.compartiendoPantalla ? <MonitorOff className={ic} /> : <Monitor className={ic} />} etiqueta={v.compartiendoPantalla ? "Dejar de compartir pantalla" : "Compartir pantalla (elige ventana o pantalla)"} activo={v.compartiendoPantalla} onClick={a.alternarPantalla} deshabilitado={!v.compartiendoPantalla && !!v.motivos?.pantalla} motivo={v.motivos?.pantalla ?? "no disponible en esta llamada"} />
                <BotonControl icono={s.estado === "en-espera" ? <Play className={ic} /> : <Pause className={ic} />} etiqueta={s.estado === "en-espera" ? "Reanudar llamada" : "Poner en espera"} activo={s.estado === "en-espera"} onClick={a.alternarEspera} motivo="la llamada directa aún no admite espera" />
                {(s.tipo === "video" || s.tipo === "grupo") && <BotonControl icono={<Users className={ic} />} etiqueta={rejilla ? "Vista de orador" : "Vista en rejilla"} activo={rejilla} onClick={() => setRejilla((x) => !x)} />}
                {(conVideoRemoto || !!v.motivos?.pip) && <BotonControl icono={<PictureInPicture2 className={ic} />} etiqueta="Imagen en imagen" onClick={pip} deshabilitado={!!v.motivos?.pip} motivo={v.motivos?.pip} />}
                {a.reaccionar && (
                  <span className="relative">
                    <BotonControl icono={<Smile className={ic} />} etiqueta="Reaccionar" activo={reaccionando} onClick={() => setReaccionando((x) => !x)} />
                    {reaccionando && (
                      <span role="group" aria-label="Reacciones" className="absolute bottom-12 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-white/15 bg-slate-900/95 p-1 shadow-xl">
                        {EMOJIS_REACCION.map((em) => (
                          <button key={em} type="button" aria-label={`Reaccionar con ${em}`} onClick={() => { a.reaccionar?.(em); setReaccionando(false); }} className="h-8 w-8 cursor-pointer rounded-full text-lg transition-transform duration-150 hover:scale-110 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 motion-reduce:transition-none">{em}</button>
                        ))}
                      </span>
                    )}
                  </span>
                )}
                {s.tipo === "pantalla" && <BotonControl icono={<Circle className={ic} />} etiqueta={resaltar ? "Quitar resaltado del puntero" : "Resaltar el puntero"} activo={resaltar} onClick={() => setResaltar((x) => !x)} />}
                {a.colgarTodos && v.puedeTerminarParaTodos && <BotonControl peligro icono={<Users className={ic} />} etiqueta="Terminar para todos" onClick={a.colgarTodos} />}
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
