"use client";

// Ventana remota (§9, tarea R): usar la ventana de otra neurona. El vídeo es la pista que el
// anfitrión transmite por WebRTC; el ratón, el teclado, la rueda y el tacto se mandan por el
// canal de datos con `crearCliente`. La barra enseña quién presta y la calidad MEDIDA del vídeo
// (nunca inventada), avisa si la latencia pasa de 150 ms y ofrece Cortar la sesión.

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { AlertTriangle, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crearCliente, type Enviar, type EventoVideo } from "@/lib/apps-remotas/cliente";

/** Aviso visible cuando la latencia medida pasa de este tope (§9: calidad y latencia). */
export const TOPE_LATENCIA_MS = 150;

export type HistoriasVentanaRemota = {
  pista: MediaStream | null;
  app: string;
  prestador: string;
  sesionId: string;
  enviar: Enviar;
  alCortar?: () => void;
  latenciaMs?: number | null;
};

export default function VentanaRemota({
  pista,
  app,
  prestador,
  sesionId,
  enviar,
  alCortar,
  latenciaMs = null,
}: HistoriasVentanaRemota) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [cortada, setCortada] = useState(false);
  const [medida, setMedida] = useState<{ ancho: number; alto: number } | null>(null);
  const cliente = useMemo(() => crearCliente({ enviar, sesionId }), [enviar, sesionId]);

  useEffect(() => {
    const el = video.current;
    if (el && el.srcObject !== pista) el.srcObject = pista;
  }, [pista]);

  const lanzar = (evento: EventoVideo) => {
    const el = video.current;
    if (cortada || !el) return;
    cliente.entrar(evento, el.getBoundingClientRect(), { ancho: el.videoWidth, alto: el.videoHeight });
  };
  const punto = (e: ReactPointerEvent<HTMLVideoElement>) => ({ x: e.clientX, y: e.clientY });
  const eTeclado = (e: ReactKeyboardEvent<HTMLVideoElement>, accion: "pulsar" | "soltar"): EventoVideo =>
    ({ tipo: "teclado", accion, tecla: e.code, modificadores: { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey } });

  if (cortada) {
    return <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">Sesión con {prestador} cortada.</div>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur">
      {/* Barra: quién presta · calidad medida · latencia · Cortar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
        <span className="font-medium">
          Presta <span className="text-foreground">{prestador}</span>
          <span className="text-muted-foreground"> · {app}</span>
        </span>
        <span className="text-muted-foreground">
          {medida ? `${medida.ancho}×${medida.alto}` : "Calidad sin medir"}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {latenciaMs !== null && (
            <span className={latenciaMs > TOPE_LATENCIA_MS ? "font-medium text-amber-400" : "text-muted-foreground"}>
              {latenciaMs} ms
            </span>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="cursor-pointer bg-destructive/90 px-3"
            onClick={() => {
              setCortada(true);
              alCortar?.();
            }}
          >
            <Scissors className="size-4" aria-hidden /> Cortar
          </Button>
        </span>
      </div>

      {latenciaMs !== null && latenciaMs > TOPE_LATENCIA_MS && (
        <div className="flex items-center gap-2 border-t border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs text-amber-300">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          Latencia {latenciaMs} ms: por encima del tope de {TOPE_LATENCIA_MS} ms. La app seguirá; puede ir entrecortada.
        </div>
      )}

      {/* Vídeo: pista del anfitrión; manda entradas mapeadas al tamaño real del vídeo */}
      <video
        ref={video}
        className="block aspect-video w-full cursor-pointer bg-black object-contain outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        tabIndex={0}
        aria-label={`Ventana de ${app} prestada por ${prestador}`}
        playsInline
        autoPlay
        muted
        onLoadedMetadata={() => {
          const el = video.current;
          if (el && el.videoWidth > 0 && el.videoHeight > 0) setMedida({ ancho: el.videoWidth, alto: el.videoHeight });
        }}
        onPointerDown={(e) => { e.preventDefault(); lanzar(e.pointerType === "touch" ? { tipo: "tacto", accion: "empezar", ...punto(e) } : { tipo: "raton", accion: "pulsar", boton: e.button, ...punto(e) }); }}
        onPointerMove={(e) => lanzar(e.pointerType === "touch" ? { tipo: "tacto", accion: "mover", ...punto(e) } : { tipo: "raton", accion: "mover", ...punto(e) })}
        onPointerUp={(e) => lanzar(e.pointerType === "touch" ? { tipo: "tacto", accion: "fin", ...punto(e) } : { tipo: "raton", accion: "soltar", boton: e.button, ...punto(e) })}
        onWheel={(e) => lanzar({ tipo: "rueda", x: e.clientX, y: e.clientY, deltaY: e.deltaY })}
        onKeyDown={(e) => { if (!e.repeat) lanzar(eTeclado(e, "pulsar")); }}
        onKeyUp={(e) => lanzar(eTeclado(e, "soltar"))}
      />
    </div>
  );
}
