"use client";

/** Piezas pequeñas de la superficie de llamada (LLA1108C): pista de medios, botón de control, cronómetro. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatearDuracion } from "@/lib/llamadas/formato";
import { anotarLlamada } from "@/lib/llamadas/voz-datos/diagnostico";

type ConSinkId = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> };

/** Salidas de audio del aparato (`setSinkId` solo donde existe: Chromium; en Safari/WebKit no hay selector). */
export function useSalidasAudio() {
  const [lista, setLista] = useState<Array<{ id: string; etiqueta: string }>>([]);
  const [elegida, setElegida] = useState<string>("default");
  const soportado = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
  useEffect(() => {
    if (!soportado || typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    let vivo = true;
    const leer = () =>
      navigator.mediaDevices.enumerateDevices().then((d) => {
        if (vivo) setLista(d.filter((x) => x.kind === "audiooutput").map((x, i) => ({ id: x.deviceId, etiqueta: x.label || `Salida ${i + 1}` })));
      }).catch(() => {});
    void leer();
    navigator.mediaDevices.addEventListener?.("devicechange", leer);
    return () => { vivo = false; navigator.mediaDevices.removeEventListener?.("devicechange", leer); };
  }, [soportado]);
  return { lista, elegida, elegir: setElegida, soportado };
}

/**
 * VID1110A: monta TAL CUAL el canvas donde el vídeo ligero pinta lo que llega por el enlace de datos. Sin <video> ni
 * `captureStream`: un canvas en el documento se ve igual en WKWebView que en Chromium, y se repinta solo.
 */
export function LienzoLigero({ lienzo, className, etiqueta }: { lienzo: HTMLCanvasElement; className?: string; etiqueta?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    lienzo.style.width = "100%";
    lienzo.style.height = "100%";
    lienzo.style.objectFit = "cover";
    lienzo.style.display = "block";
    lienzo.setAttribute("role", "img");
    if (etiqueta) lienzo.setAttribute("aria-label", etiqueta);
    host.appendChild(lienzo);
    return () => {
      if (lienzo.parentNode === host) host.removeChild(lienzo);
    };
  }, [lienzo, etiqueta]);
  return <div ref={ref} data-lienzo-ligero="" className={cn("bg-black", className)} />;
}

export function Pista({ stream, lienzo, espejo, video, silenciar, sinkId, className, etiqueta, remoto, local, volumen }: { stream: MediaStream | null | undefined; /** VID1110A: vídeo ligero por enlace de datos; si está, se pinta en lugar del <video>. */ lienzo?: HTMLCanvasElement | null; /** VID1110A: mi vista previa como espejo. */ espejo?: boolean; video: boolean; silenciar?: boolean; sinkId?: string; className?: string; etiqueta?: string; remoto?: boolean; /** LLA1110C: mi vista previa (para la telemetría de visibilidad). */ local?: boolean; /** 0..1 (LLA1108G) */ volumen?: number }) {
  const ref = useRef<HTMLMediaElement | null>(null);
  const conLienzo = video && !!lienzo;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== (stream ?? null)) el.srcObject = stream ?? null;
    // LLA1110C: `autoPlay` no basta en todos los WebView (WKWebView con srcObject puesto tras montar): se pide play()
    // y, si lo rechaza, queda en el registro (antes la promesa se tragaba y el <video> se quedaba en negro).
    if (stream)
      void el.play?.()?.catch((e: unknown) => {
        anotarLlamada("medio=video-datos", null, `visibilidad play-rechazado ${video ? "video" : "audio"}${remoto ? "=remoto" : local ? "=local" : ""} error=${e instanceof Error ? e.name : "?"}`);
      });
  }, [stream, video, conLienzo, remoto, local]);
  useEffect(() => {
    if (ref.current && volumen !== undefined) ref.current.volume = Math.max(0, Math.min(1, volumen));
  }, [volumen, stream, video]);
  useEffect(() => {
    const el = ref.current as ConSinkId | null;
    if (el && sinkId && el.setSinkId) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId, stream, video]);
  if (video && lienzo) return <LienzoLigero lienzo={lienzo} className={className} etiqueta={etiqueta} />;
  if (!stream) return null;
  return video ? (
    <video ref={ref as React.RefObject<HTMLVideoElement>} autoPlay playsInline muted={silenciar} aria-label={etiqueta} data-remoto={remoto ? "" : undefined} data-local={local ? "" : undefined} style={espejo ? { transform: "scaleX(-1)" } : undefined} className={cn("bg-black object-cover", className)} />
  ) : (
    <audio ref={ref as React.RefObject<HTMLAudioElement>} autoPlay muted={silenciar} />
  );
}

export function Cronometro({ ms, className }: { ms: number; className?: string }) {
  const t = formatearDuracion(ms);
  return <time dateTime={`PT${Math.round(ms / 1000)}S`} className={cn("tabular-nums", className)} aria-label={`Duración ${t}`}>{t}</time>;
}

export function BotonControl({
  icono,
  etiqueta,
  onClick,
  activo,
  peligro,
  deshabilitado,
  motivo,
  pequeno,
  children,
}: {
  icono: ReactNode;
  etiqueta: string;
  onClick?: () => void;
  activo?: boolean;
  peligro?: boolean;
  deshabilitado?: boolean;
  /** Por qué no está disponible (se lee como descripción y sale en el título). */
  motivo?: string;
  pequeno?: boolean;
  children?: ReactNode;
}) {
  const off = deshabilitado || !onClick;
  return (
    <button
      type="button"
      onClick={off ? undefined : onClick}
      disabled={off}
      aria-label={etiqueta}
      aria-pressed={activo === undefined ? undefined : activo}
      title={off && motivo ? `${etiqueta}: ${motivo}` : etiqueta}
      className={cn(
        "inline-flex shrink-0 cursor-pointer select-none items-center justify-center rounded-full border backdrop-blur transition-[background-color,border-color,transform,opacity] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/80 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100",
        "disabled:cursor-not-allowed disabled:opacity-40",
        pequeno ? "h-8 w-8" : "h-11 w-11",
        peligro
          ? "border-rose-400/50 bg-rose-500/80 text-white hover:bg-rose-500"
          : activo
            ? "border-violet-300/60 bg-violet-400/30 text-white hover:bg-violet-400/40"
            : "border-white/15 bg-white/10 text-white/90 hover:border-white/30 hover:bg-white/15",
      )}
    >
      {icono}
      {children}
    </button>
  );
}

/** Barras de señal (no solo color: también texto accesible). */
export function Barras({ n, texto }: { n: number; texto: string }) {
  return (
    <span role="img" aria-label={texto} className="inline-flex h-3.5 items-end gap-[2px]">
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cn("w-[3px] rounded-sm", i <= n ? "bg-emerald-300" : "bg-white/25")} style={{ height: `${25 + i * 18}%` }} />
      ))}
    </span>
  );
}

/**
 * LLA1111A · la imagen del otro con relevo SIN NEGRO entre el vídeo ligero (lienzo del enlace de datos) y el `<video>`
 * de WebRTC. En el banco, 2 de cada 3 relevos a WebRTC dejaban la pantalla negra: el motor soltaba el lienzo al ver
 * cuadros decodificados (getStats) mientras la pista seguía «muted», y la superficie no montaba un `<video>` de una pista
 * muda. Ahora:
 *  · el `<video>` se monta siempre que haya una pista de vídeo viva (aunque esté «muted») y se mira si PINTA de verdad
 *    (`requestVideoFrameCallback`, o el reloj del vídeo avanzando donde no exista);
 *  · el lienzo (el actual o el último que hubo) se queda encima hasta que el `<video>` ha pintado un cuadro;
 *  · a la vuelta, en cuanto el motor da el lienzo (ya con imagen: solo lo da recibiendo), pasa encima;
 *  · (LLA1111H) y se cuenta al motor si el <video> pinta de verdad (`alVideoPinta`), porque una pista puede decodificar cuadros
 *    y no entregar ninguno al elemento: sin eso el motor suelta el lienzo y queda negro. No se reengancha el flujo: en el banco ni un
 *    <video> nuevo, ni una copia de la pista, ni apagarla y encenderla, ni un lector directo recibían cuadros de esa pista.
 * `alPintar` avisa de si se ve imagen (el lienzo encima o el `<video>` pintando), para que la ventana no tape con «Sin imagen».
 */
const SOSTENER_LIENZO_MS = 8000;
const FIRME_MS = 250;

export function ImagenRemota({ stream, lienzo, className, etiqueta, sinkId, silenciar, alPintar, alVideoPinta, vencerMs = 2000 }: { stream: MediaStream | null | undefined; lienzo?: HTMLCanvasElement | null; className?: string; etiqueta?: string; sinkId?: string; silenciar?: boolean; alPintar?: (pinta: boolean) => void; /** (LLA1111H) Si el <video> de WebRTC pinta cuadros DE VERDAD (null: no se sabe, p. ej. con la pestaña oculta). Se repite cada 1,5 s. */ alVideoPinta?: (pinta: boolean | null) => void; /** (LLA1111H) Cuánto sin cuadros nuevos antes de dejar de contarlo como «pinta» (una pantalla compartida quieta manda pocos). */ vencerMs?: number }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const ultimoLienzo = useRef<HTMLCanvasElement | null>(null);
  if (lienzo) ultimoLienzo.current = lienzo;
  const pista = stream?.getVideoTracks().find((t) => t.readyState === "live") ?? null;
  const pistaId = pista?.id ?? null;
  // «Pinta» vale para ESTE flujo y ESTA pista: al cambiar de flujo (del vídeo ligero a WebRTC) no hereda lo de antes, ni
  // siquiera durante el cuadro que tarda el efecto en enterarse (era un cuadro negro).
  const clave = `${stream?.id ?? "-"}|${pistaId ?? "-"}`;
  const [pintaDe, setPintaDe] = useState<string | null>(null);
  const pinta = pintaDe === clave;
  const [firmeDe, setFirmeDe] = useState<string | null>(null);
  // Cuánto se sostiene el último lienzo sin que el <video> pinte (después, mejor decir «sin imagen» que congelar).
  const [sostener, setSostener] = useState(true);
  useEffect(() => {
    if (lienzo) {
      setSostener(true);
      // Mientras manda el lienzo, el <video> tiene que volver a demostrar que pinta (cuadros nuevos) antes de quitarlo.
      setPintaDe(null);
      setFirmeDe(null);
      return;
    }
    const id = setTimeout(() => setSostener(false), SOSTENER_LIENZO_MS);
    return () => clearTimeout(id);
  }, [lienzo]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream || !pistaId) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play?.()?.catch((e: unknown) => anotarLlamada("medio=video-datos", null, `visibilidad play-rechazado video=remoto error=${e instanceof Error ? e.name : "?"}`));
    let vivo = true;
    let t0 = -1;
    // (LLA1111H) «Pinta» caduca: un <video> que se queda con el último cuadro (pista congelada) no pinta, aunque se vea algo.
    let ultimo = Date.now();
    const cuadro = () => {
      ultimo = Date.now();
      setPintaDe(clave);
    };
    type ConRvfc = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (id: number) => void };
    const v = el as ConRvfc;
    let idCb: number | null = null;
    if (typeof v.requestVideoFrameCallback === "function") {
      const bucle = () => {
        if (!vivo) return;
        cuadro();
        idCb = v.requestVideoFrameCallback!(bucle);
      };
      idCb = v.requestVideoFrameCallback(bucle);
    }
    // Sin rVFC: el reloj del vídeo avanza con dimensiones = está pintando. (Una vez pintado, un cuadro quieto se queda: si
    // el motor vuelve al enlace de datos, su lienzo pasa encima en cuanto tiene imagen.)
    const id = setInterval(() => {
      if (!vivo) return;
      if (typeof v.requestVideoFrameCallback !== "function" && el.videoWidth > 0 && el.currentTime !== t0 && t0 >= 0) cuadro();
      t0 = el.currentTime;
      if (Date.now() - ultimo > vencerMs) setPintaDe((p) => (p === clave ? null : p));
    }, 250);
    return () => {
      vivo = false;
      clearInterval(id);
      if (idCb !== null) v.cancelVideoFrameCallback?.(idCb);
    };
  }, [stream, pistaId, clave, vencerMs]);
  useEffect(() => {
    const el = ref.current as ConSinkId | null;
    if (el && sinkId && el.setSinkId) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId, stream]);
  // (LLA1111H) El motor decide por dónde llega la imagen con las estadísticas de WebRTC («se decodifican cuadros»); en el banco
  // hubo pistas «muted» cuyo decodificador iba bien y que no entregaban NI UN cuadro a ningún <video> (ni a un lector directo).
  // Solo este elemento lo sabe: se lo cuenta al motor, que en ese caso sigue con el vídeo ligero (y el otro lado también).
  useEffect(() => {
    if (!alVideoPinta || !pistaId) return;
    const decir = () => alVideoPinta(typeof document !== "undefined" && document.visibilityState === "hidden" ? null : pinta);
    decir();
    const id = setInterval(decir, 1500);
    return () => clearInterval(id);
  }, [alVideoPinta, pinta, pistaId]);
  // Al irse (o sin pista) deja de valer lo dicho. Aparte: si fuera en cada cambio de «pinta», el juicio del motor oscilaría.
  useEffect(() => {
    if (!pistaId) alVideoPinta?.(null);
  }, [alVideoPinta, pistaId]);
  useEffect(() => () => alVideoPinta?.(null), [alVideoPinta]);
  // El <video> manda solo cuando lleva un rato pintando (no por un cuadro suelto que llegó al cambiar).
  const firme = pinta && firmeDe === clave;
  useEffect(() => {
    if (!pinta) return;
    const id = setTimeout(() => setFirmeDe(clave), FIRME_MS);
    return () => clearTimeout(id);
  }, [pinta, clave]);
  // El lienzo encima: el que da el motor; si ya no lo da, el último mientras el <video> no pinte firme (un rato).
  const encima = lienzo ?? (!firme && pista && sostener ? ultimoLienzo.current : null);
  // La capa del lienzo se queda montada (solo se hace transparente): quitarla y ponerla del DOM dejaba un cuadro en negro.
  const capa = lienzo ?? (pista ? ultimoLienzo.current : null);
  const hayImagen = !!encima || pinta;
  useEffect(() => {
    alPintar?.(hayImagen);
  }, [hayImagen, alPintar]);
  useEffect(() => () => alPintar?.(false), [alPintar]);
  if (!pista && !capa) return null;
  return (
    <div className={cn("relative", className)} data-imagen-remota={encima ? "lienzo" : "video"}>
      {pista && <video ref={ref} autoPlay playsInline muted={silenciar} aria-label={encima ? undefined : etiqueta} aria-hidden={encima ? true : undefined} data-remoto="" className="absolute inset-0 h-full w-full bg-black object-contain" />}
      {capa && (
        <div aria-hidden={encima ? undefined : true} className="absolute inset-0" style={{ opacity: encima ? 1 : 0, pointerEvents: "none" }} data-capa-lienzo={encima ? "visible" : "oculta"}>
          <LienzoLigero lienzo={capa} className="h-full w-full" etiqueta={encima ? etiqueta : undefined} />
        </div>
      )}
    </div>
  );
}
