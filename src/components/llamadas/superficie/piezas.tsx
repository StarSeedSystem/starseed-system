"use client";

/** Piezas pequeñas de la superficie de llamada (LLA1108C): pista de medios, botón de control, cronómetro. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatearDuracion } from "@/lib/llamadas/formato";

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

export function Pista({ stream, video, silenciar, sinkId, className, etiqueta, remoto }: { stream: MediaStream | null | undefined; video: boolean; silenciar?: boolean; sinkId?: string; className?: string; etiqueta?: string; remoto?: boolean }) {
  const ref = useRef<HTMLMediaElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream ?? null;
  }, [stream, video]);
  useEffect(() => {
    const el = ref.current as ConSinkId | null;
    if (el && sinkId && el.setSinkId) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId, stream, video]);
  if (!stream) return null;
  return video ? (
    <video ref={ref as React.RefObject<HTMLVideoElement>} autoPlay playsInline muted={silenciar} aria-label={etiqueta} data-remoto={remoto ? "" : undefined} className={cn("bg-black object-cover", className)} />
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
